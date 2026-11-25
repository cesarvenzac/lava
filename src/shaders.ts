/**
 * The render, five passes, each a fragment shader over the whole of its target:
 *
 * - SCENE: the wax, ray-marched through a long lens. Solid 3D: ellipsoids run together with a
 *   smooth union, stretched along their climb, each with a trailing lobe and a neck down into a
 *   rounded pool on the bulb. Each pixel looks only at the blobs whose bounds cover it. Lit by the
 *   bulb through the wax beneath, translucent where it's thin, creased where wax meets wax, with a
 *   glossy skin; wax further back sinks into the liquid. Writes colour and depth.
 * - FOCUS: a depth of field from that depth (Dennis Gustafsson's single-pass bokeh).
 * - DOWN and UP: bloom, as Jorge Jimenez built it for Call of Duty.
 * - FILM: bloom added, exposure, ACES (Stephen Hill's fit), the corners falling off and fringing
 *   a little, and a fine grain.
 *
 * Every pass is drawn by one triangle, VERTEX, covering its target.
 */

import { MOST } from "./plan.ts";

export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uUnit;            // the box's shorter side, as a share of its height
uniform vec4 uBlob[${MOST}];     // centre, radius
uniform vec4 uTail[${MOST}];     // the lobe trailing it: centre, radius
uniform vec4 uBound[${MOST}];    // what it can cover: centre on screen, radius there, half its depth
uniform vec4 uShape[${MOST}];    // its stretch, and how much it rings as a pear and in four lobes
uniform vec4 uMound[${MOST}];    // where the pool heaves or bulges: x, z, height, width
uniform int uMounds;
uniform vec4 uNeck[${MOST}];     // the neck down to the pool: its top, its bottom, its radius at each (0: none)
uniform vec4 uRoot[${MOST}];     // what's left in the pool of a neck that parted: its foot, its top, its radius at each
uniform float uPoolReach;       // the highest the pool, its mounds and the necks' roots reach
uniform int uCount;
uniform float uPool;
uniform float uWobble;
uniform vec3 uWax;
uniform vec3 uHeat;
uniform vec3 uLiquid;
uniform vec3 uLight;
uniform float uGlow;
uniform float uGloss;
uniform float uHaze;
out vec4 outScene;              // colour, and depth (z, in units of the shorter side)

const float FAR = -4.0;
int cand[${MOST}];
int nc = 0;
bool poolHere = false;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k * (1.0 / 6.0);
}
// Inigo Quilez's ellipsoid bound: close to the true distance, and never over it.
float ellipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
float capsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
// A rounded cone from a (radius ra) to b (radius rb): Inigo Quilez's, exact. A drip tapers.
float cone(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba), rr = ra - rb, a2 = l2 - rr * rr;
  // When one end's sphere holds the other's, the shape is simply the larger sphere.
  if (a2 <= 1e-9) return min(length(p - a) - ra, length(p - b) - rb);
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba), z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - rb;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - ra;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}
float poolTop(vec2 xz) {
  float n = xz.x / uUnit;
  float y = -0.5 + uPool * uUnit + uUnit * (0.014 * sin(n * 3.1 + uTime * 0.11) + 0.006 * sin(n * 7.3 - uTime * 0.17));
  // The pool heaves into a broad mound under a blob it's letting go of, and bulges round one
  // pressing into it. Wax this thick never ripples.
  for (int i = 0; i < ${MOST}; i++) {
    if (i >= uMounds) break;
    vec4 m = uMound[i];
    if (m.z <= 0.0) continue;
    vec2 d = (xz - m.xy) / m.w;
    y += m.z * exp(-dot(d, d));
  }
  return y;
}
float pool(vec3 p) {
  float rr = 0.55 * uUnit;
  return length(vec2(p.y - (poolTop(p.xz) - rr), p.z * 1.25)) - rr;
}

float wax(vec3 p) {
  float d = 1e3, roots = 1e3;
  for (int j = 0; j < ${MOST}; j++) {
    if (j >= nc) break;
    int i = cand[j];
    vec4 b = uBlob[i];
    vec4 sh = uShape[i];
    float s = sh.x;
    float side = b.w / sqrt(s);
    vec3 l = p - b.xyz;
    float e = ellipsoid(l, vec3(side, b.w * s, side));
    // Slow waves run over its own surface, carried with it.
    vec3 dir = l / max(length(l), 1e-5);
    float waves = sin(dot(dir, vec3(2.6, 1.9, 2.2)) * 1.6 + uTime * 0.32 + float(i) * 1.7)
                + sin(dot(dir, vec3(-2.0, 2.8, 1.1)) * 2.1 - uTime * 0.41 + float(i) * 2.9);
    e -= b.w * 0.007 * uWobble * waves;
    vec4 tl = uTail[i];
    e = smin(e, length(p - tl.xyz) - tl.w, b.w * 0.7);
    // The neck: a thick column from inside the blob down into the pool, flaring into both,
    // thinning slowly as they part.
    vec4 nk = uNeck[i];
    if (nk.z > 0.0) e = smin(e, cone(p, vec3(b.x, nk.x, b.z), vec3(b.x, nk.y, b.z), nk.z, nk.w), b.w * 0.6);
    // Blobs melt together only where they touch: the blend is a share of each blob's own size.
    d = smin(d, e, b.w * 0.38);
    // What a parted neck left in the pool, slumping back into it.
    vec4 rt = uRoot[i];
    if (rt.z > 0.0) roots = min(roots, cone(p, vec3(b.x, rt.x, b.z), vec3(b.x, rt.y, b.z), rt.z, rt.w));
  }
  if (poolHere) d = smin(d, smin(pool(p), roots, 0.08 * uUnit), 0.1 * uUnit);
  else d = min(d, roots);
  return d;
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0008;
  return normalize(e.xyy * wax(p + e.xyy) + e.yyx * wax(p + e.yyx) + e.yxy * wax(p + e.yxy) + e.xxx * wax(p + e.xxx));
}
// How much of a point is wax, as a ramp as wide as the spacing of the samples it's summed over:
// ramps that wide, side by side, add up to a straight line, so a thickness never steps or bands.
float filled(vec3 p, float spacing) { return clamp(0.5 - wax(p) / spacing, 0.0, 1.0); }
// Creases where wax meets wax: how much the space just off the surface is taken.
float creases(vec3 p, vec3 n) {
  float o = 0.0, w = 0.5;
  for (int i = 1; i <= 3; i++) {
    float h = float(i) * 0.028 * uUnit;
    o += w * clamp((h - wax(p + n * h)) / h, 0.0, 1.0);
    w *= 0.6;
  }
  return clamp(1.0 - 0.75 * o, 0.0, 1.0);
}

vec3 liquid(vec2 q, float aspect) {
  float rise = exp(-pow((q.y + 0.62) / 0.62, 2.0));
  float middle = 0.55 + 0.45 * exp(-q.x * q.x / (aspect * aspect * 0.14));
  vec3 c = uLiquid + uLight * rise * middle * 0.85;
  return c * (0.95 + 0.05 * sin(q.x * 2.3 + uTime * 0.05) * sin(q.y * 1.9 - uTime * 0.04));
}

vec3 shade(vec3 p, float aspect) {
  vec3 N = normalAt(p);
  float ndv = clamp(N.z, 0.0, 1.0);
  float bulb = exp(-clamp(p.y + 0.5, 0.0, 1.6) * 1.3) * (0.78 + 0.22 * exp(-p.x * p.x / (aspect * aspect * 0.16)));
  // The wax between this point and the bulb, and between it and the eye.
  float below = 0.0, seen = 0.0;
  float down = 0.055 * uUnit, back = 0.04 * uUnit;
  for (int i = 1; i <= 3; i++) {
    vec3 x = p - vec3(0.0, float(i) * down, 0.0);
    below += filled(x, down) * clamp((x.y + 0.5) / down + 0.5, 0.0, 1.0);
    seen += filled(p - vec3(0.0, 0.0, float(i) * back), back);
  }
  float E = bulb * exp(-below * 0.36);        // the bulb's light that reaches here
  float thin = exp(-seen * 0.45);             // 1 where the eye sees through little wax
  float facing = clamp((dot(N, normalize(vec3(0.0, -1.0, 0.3))) + 0.6) / 1.6, 0.0, 1.0);
  float ao = creases(p, N);
  vec3 deep = uWax * uWax * 0.85;
  vec3 body = mix(deep, uWax, clamp(E * 1.5 + 0.15, 0.0, 1.0));
  body = mix(body, uHeat, clamp(E * (0.75 * thin + 0.7 * pow(1.0 - ndv, 2.0)) + 0.12 * E, 0.0, 1.0));
  // Lit by the bulb through the wax under it; glowing a little everywhere with the light scattered
  // inside it; and taking the colour of the lit liquid all round it.
  vec3 c = body * (0.07 + E * (0.45 + 1.9 * facing) * 2.3 * uGlow) * ao;
  c += body * uLight * 0.45 * ao;
  c += uLight * pow(1.0 - ndv, 3.0) * 0.3 * ao;                        // the lit liquid behind, caught at the rim
  // A glossy skin: a GGX highlight from a soft key light, and the soft box and the lit liquid seen in it.
  vec3 L = normalize(vec3(-0.5, 0.72, 0.55));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float rough = mix(0.42, 0.09, clamp(uGloss / 1.5, 0.0, 1.0));
  float a2 = rough * rough * rough * rough;
  float ndh = max(dot(N, H), 0.0);
  float den = ndh * ndh * (a2 - 1.0) + 1.0;
  float ggx = a2 / (3.14159 * den * den);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  c += vec3(1.0, 0.96, 0.92) * min(ggx * fres * 0.25, 8.0) * min(uGloss, 1.0) * ao;
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  c += (vec3(1.0, 0.96, 0.92) * smoothstep(0.82, 0.97, dot(R, L)) * 0.9 + uLight * 0.3 * clamp(-R.y, 0.0, 1.0)) * fres * uGloss * ao;
  return c;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 back = liquid(q, aspect);
  // Only the blobs that can matter here are looked at: those whose bounds cover this pixel, or
  // reach the points below it that its light is measured through. Otherwise a blob would be
  // found or lost as a pixel crossed a bound, and its light would jump.
  float zHi = -1e3, zLo = 1e3;
  float reach = 0.18 * uUnit;
  bool onRay = false;
  for (int i = 0; i < ${MOST}; i++) {
    if (i >= uCount) break;
    vec4 bd = uBound[i];
    vec2 dd = q - bd.xy;
    // The light is measured straight down: a bound counts for the column of points under it.
    dd.y = dd.y > 0.0 ? max(dd.y - reach, 0.0) : dd.y;
    float near_ = bd.z + 0.03 * uUnit;
    if (dot(dd, dd) < near_ * near_) {
      cand[nc] = i;
      nc++;
      vec2 own = q - bd.xy;
      if (dot(own, own) < bd.z * bd.z) {
        onRay = true;
        zHi = max(zHi, uBlob[i].z + bd.w);
        zLo = min(zLo, uBlob[i].z - bd.w);
      }
    }
  }
  // The pool: wherever its blend can reach, its highest sway and the blend's width above that,
  // and the points below that are measured.
  float poolReach = uPoolReach;
  poolHere = uPool > 0.0 && q.y < poolReach + reach + 0.03 * uUnit;
  if (uPool > 0.0 && q.y < poolReach) { onRay = true; zHi = max(zHi, 0.46 * uUnit); zLo = min(zLo, -0.46 * uUnit); }
  if (!onRay) { outScene = vec4(back, FAR); return; }

  // A long lens: every ray runs straight back, so nothing leans.
  float span = zHi - zLo;
  float t = 0.0, closest = 1e3, at = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = wax(vec3(q, zHi - t));
    if (d < closest) { closest = d; at = t; }
    if (d < 0.0003) { hit = true; break; }
    t += max(d * 0.75, 0.001);
    if (t > span) break;
  }
  // Edges are covered by how near the ray came, in pixels: smooth without more rays.
  float cover = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.4 / uRes.y, closest);
  if (cover <= 0.0) { outScene = vec4(back, FAR); return; }
  vec3 p = vec3(q, zHi - (hit ? t : at));
  vec3 c = shade(p, aspect);
  // Wax further back sinks into the liquid's own light.
  c = mix(back, c, exp(-max(-p.z, 0.0) / uUnit * 2.2 * uHaze));
  outScene = vec4(mix(back, c, cover), cover > 0.5 ? p.z / uUnit : FAR);
}`;

export const FOCUS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocus;
uniform float uAperture;
uniform float uMost;
uniform float uStride;   // the spiral's step: at least some thirty samples, however small the blur
out vec4 outColour;
float blurAt(float z) { return min(abs(z - uFocus) * uAperture, uMost); }
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec4 centre = texture(uScene, uv);
  float centreBlur = blurAt(centre.a);
  vec3 sum = min(centre.rgb, vec3(4.0));
  float count = 1.0;
  // Each pixel turns the spiral by its own amount, so its pattern becomes a fine noise the grain
  // hides, never rings; and no sample is let past a ceiling, so a highlight can't stamp the pattern.
  float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float radius = uStride * (0.6 + 0.4 * turn);
  float angle = turn * 6.2831853;
  for (int i = 0; i < 90; i++) {
    if (radius >= uMost) break;
    vec4 s = texture(uScene, uv + vec2(cos(angle), sin(angle)) * uTexel * radius);
    s.rgb = min(s.rgb, vec3(4.0));
    float b = blurAt(s.a);
    if (s.a < centre.a) b = min(b, centreBlur * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, b);
    sum += mix(sum / count, s.rgb, m);
    count += 1.0;
    angle += 2.39996323;
    radius += uStride / radius;
  }
  outColour = vec4(sum / count, centre.a);
}`;

export const DOWN = `#version 300 es
precision highp float;
uniform sampler2D uFrom;
uniform vec2 uTexel;     // a texel of the source
uniform vec2 uOut;       // a pixel of the target, in uv
uniform int uFirst;
out vec4 outColour;
vec3 at(vec2 uv, vec2 o) { return texture(uFrom, uv + o * uTexel).rgb; }
void main() {
  vec2 uv = gl_FragCoord.xy * uOut;
  vec3 c = at(uv, vec2(0.0)) * 0.125
    + (at(uv, vec2(-2.0, 2.0)) + at(uv, vec2(2.0, 2.0)) + at(uv, vec2(-2.0, -2.0)) + at(uv, vec2(2.0, -2.0))) * 0.03125
    + (at(uv, vec2(0.0, 2.0)) + at(uv, vec2(-2.0, 0.0)) + at(uv, vec2(2.0, 0.0)) + at(uv, vec2(0.0, -2.0))) * 0.0625
    + (at(uv, vec2(-1.0, 1.0)) + at(uv, vec2(1.0, 1.0)) + at(uv, vec2(-1.0, -1.0)) + at(uv, vec2(1.0, -1.0))) * 0.125;
  if (uFirst == 1) {
    // Only light past a soft threshold blooms, and no single bright pixel flickers.
    float bright = max(c.r, max(c.g, c.b));
    float knee = 0.45;
    float soft = clamp(bright - 0.75 + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    c *= max(soft, bright - 0.75) / max(bright, 1e-4);
    c /= 1.0 + max(c.r, max(c.g, c.b)) * 0.25;
  }
  outColour = vec4(c, 1.0);
}`;

export const UP = `#version 300 es
precision highp float;
uniform sampler2D uFrom;
uniform vec2 uTexel;
uniform vec2 uOut;
out vec4 outColour;
void main() {
  vec2 uv = gl_FragCoord.xy * uOut;
  vec4 d = uTexel.xyxy * vec4(1.0, 1.0, -1.0, 0.0);
  vec3 s = texture(uFrom, uv - d.xy).rgb + texture(uFrom, uv - d.wy).rgb * 2.0 + texture(uFrom, uv - d.zy).rgb
    + texture(uFrom, uv + d.zw).rgb * 2.0 + texture(uFrom, uv).rgb * 4.0 + texture(uFrom, uv + d.xw).rgb * 2.0
    + texture(uFrom, uv + d.zy).rgb + texture(uFrom, uv + d.wy).rgb * 2.0 + texture(uFrom, uv + d.xy).rgb;
  outColour = vec4(s / 16.0, 1.0);
}`;

export const FILM = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uBloomAmount;
uniform float uExposure;
uniform float uGrain;
uniform float uFrame;
out vec4 outColour;
vec3 aces(vec3 c) {
  const mat3 into = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outof = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = into * c;
  c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081);
  return clamp(outof * c, 0.0, 1.0);
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = uv - 0.5;
  float r2 = dot(c * vec2(uRes.x / uRes.y, 1.0), c * vec2(uRes.x / uRes.y, 1.0));
  vec2 fringe = c * r2 * 0.006;
  vec3 col = vec3(texture(uImage, uv - fringe).r, texture(uImage, uv).g, texture(uImage, uv + fringe).b);
  col += texture(uBloom, uv).rgb * uBloomAmount * 0.55;
  col *= 1.0 - 0.38 * smoothstep(0.08, 0.75, r2);
  col = aces(col * uExposure * 1.35);
  vec3 srgb = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  float luma = dot(srgb, vec3(0.299, 0.587, 0.114));
  float grain = hash12(gl_FragCoord.xy + fract(uFrame * 0.6180339) * 917.0) - 0.5;
  srgb += grain * 0.045 * uGrain * (1.0 - 0.7 * luma);
  // Interleaved gradient noise, so dark gradients never band.
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
  outColour = vec4(srgb + (ign - 0.5) / 255.0, 1.0);
}`;
