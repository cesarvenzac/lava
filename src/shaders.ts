/**
 * The render, five passes, each a fragment shader over the whole of its target:
 *
 * - SCENE: the wax, its field (field.ts) ray-marched through a long lens. Lit by the bulb through
 *   the wax beneath, translucent where it's thin, creased where wax meets wax, coloured by its
 *   warmth, with a satin skin; wax further back sinks into the liquid. Writes colour and depth.
 * - FOCUS: a depth of field from that depth (Dennis Gustafsson's single-pass bokeh).
 * - DOWN and UP: bloom, as Jorge Jimenez built it for Call of Duty.
 * - FILM: bloom added, exposure, ACES (Stephen Hill's fit), the corners falling off and fringing
 *   a little, and a fine grain.
 *
 * Every pass is drawn by one triangle, VERTEX, covering its target.
 */

export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The scene: the wax's field (field.ts) as 3D textures, two of them blended (the last field and the
 * one before), ray-marched from the front through a long lens to where the wax's share first passes a
 * half; lit by the bulb below through the wax beneath each point, translucent where it's thin,
 * creased where wax meets wax, coloured by its warmth, with a satin skin; wax further back sinking
 * into the liquid's own light. Writes colour and depth for the depth of field.
 */
export const SCENE = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uWax;      // this snapshot and the next, blended: the wax share
uniform sampler3D uWaxB;
uniform sampler3D uHeat;     // and the warmth, 20 to 70 degrees as 0 to 1
uniform sampler3D uHeatB;
uniform float uBlend;
uniform vec3 uBox;        // the lamp's inside, metres
uniform vec4 uView;       // the front shown: x, y, width, height
uniform vec2 uRes;
uniform float uCell;
uniform float uUnit;      // the frame's shorter side, metres: depth is measured in it
uniform vec3 uWaxC;
uniform vec3 uHot;
uniform vec3 uLiquid;
uniform vec3 uLight;
uniform float uGlow;
uniform float uGloss;
uniform float uHaze;
uniform float uHeatAmt;
uniform float uTime;
out vec4 outScene;

const float FAR = -4.0;

float waxAt(vec3 p) { vec3 t = p / uBox; return mix(texture(uWax, t).r, texture(uWaxB, t).r, uBlend); }
float heatAt(vec3 p) { vec3 t = p / uBox; return 20.0 + 50.0 * mix(texture(uHeat, t).r, texture(uHeatB, t).r, uBlend); }

vec3 liquid(vec2 q) {
  // The bulb's light rising through the liquid from the floor, strongest in the middle.
  float up = clamp(q.y / uBox.y, 0.0, 1.0);
  float rise = exp(-up * up * 3.0);
  float mid = (q.x - 0.5 * uBox.x) / uBox.x;
  vec3 c = uLiquid + uLight * rise * (0.55 + 0.45 * exp(-mid * mid * 6.0)) * 0.85;
  return c;
}

vec3 normalAt(vec3 p) {
  float e = uCell * 0.75;
  vec3 g = vec3(waxAt(p + vec3(e, 0, 0)) - waxAt(p - vec3(e, 0, 0)), waxAt(p + vec3(0, e, 0)) - waxAt(p - vec3(0, e, 0)), waxAt(p + vec3(0, 0, e)) - waxAt(p - vec3(0, 0, e)));
  return -normalize(g + 1e-6);
}

vec3 shade(vec3 p) {
  vec3 N = normalAt(p);
  float ndv = clamp(N.z, 0.0, 1.0);
  float up = p.y / uBox.y;
  float bulb = exp(-clamp(up, 0.0, 1.5) * 2.2) * (0.78 + 0.22 * exp(-pow((p.x - 0.5 * uBox.x) / uBox.x, 2.0) * 6.0));
  // The wax between this point and the bulb, and behind it from the eye: a few samples each, set
  // off by a share of a step at each pixel so their steps become a noise the grain hides.
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float below = 0.0, seen = 0.0;
  float down = 0.08 * uUnit / 4.0, back = 0.06 * uUnit / 4.0;
  for (int i = 0; i < 4; i++) {
    float k = float(i) + 0.5 + jit;
    below += waxAt(p - vec3(0.0, k * down, 0.0));
    seen += waxAt(p - vec3(0.0, 0.0, k * back));
  }
  float E = bulb * exp(-below * 0.36);
  float thin = exp(-seen * 0.45);
  float facing = clamp((dot(N, normalize(vec3(0.0, -1.0, 0.3))) + 0.6) / 1.6, 0.0, 1.0);
  // Creases: how much the space just off the surface is taken.
  float o = 0.0, w = 0.5;
  for (int i = 1; i <= 3; i++) {
    float h = float(i) * 0.028 * uUnit;
    o += w * clamp(waxAt(p + N * h) * 2.0 - 0.5, 0.0, 1.0);
    w *= 0.6;
  }
  float ao = clamp(1.0 - 0.75 * o, 0.0, 1.0);
  float T = heatAt(p);
  float hot = smoothstep(50.0, 57.0, T) * uHeatAmt;
  float cold = smoothstep(48.0, 40.0, T) * uHeatAmt;
  vec3 deep = uWaxC * uWaxC * 0.85;
  vec3 body = mix(deep, uWaxC, clamp(E * 1.5 + 0.15, 0.0, 1.0));
  body = mix(body, uHot, clamp(E * (0.75 * thin + 0.7 * pow(1.0 - ndv, 2.0)) + 0.12 * E, 0.0, 1.0));
  body = mix(body, uHot, 0.3 * hot);
  body *= 1.0 - 0.35 * cold;
  vec3 c = body * (0.07 + E * (0.45 + 1.9 * facing) * 2.3 * uGlow) * ao;
  c += uHot * hot * hot * (0.12 + 0.2 * thin) * (0.5 + E) * ao;
  c += body * uLight * 0.45 * ao;
  c += uLight * pow(1.0 - ndv, 3.0) * 0.3 * ao;
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  c += uLight * (0.4 * clamp(-R.y, 0.0, 1.0) + 0.06) * fres * uGloss * ao;
  return c;
}

void main() {
  vec2 q = uView.xy + gl_FragCoord.xy / uRes * uView.zw;
  vec3 back = liquid(q);
  if (q.x < 0.0 || q.x > uBox.x || q.y < 0.0 || q.y > uBox.y) { outScene = vec4(back, FAR); return; }
  // March from the front, half a cell at a time, to where the wax share first passes a half.
  float step_ = 0.5 * uCell;
  float z = uBox.z - 0.5 * uCell;
  float prev = waxAt(vec3(q, z));
  float most = prev;
  bool hit = prev >= 0.5;
  float zh = z;
  for (int i = 0; i < 400; i++) {
    if (hit || z < 0.5 * uCell) break;
    float zn = z - step_;
    float now = waxAt(vec3(q, zn));
    most = max(most, now);
    if (now >= 0.5) { zh = zn + step_ * (now - 0.5) / max(now - prev, 1e-4); hit = true; break; }
    prev = now;
    z = zn;
  }
  // Edges covered by how near the ray came to the surface: smooth without more rays.
  float cover = hit ? 1.0 : smoothstep(0.3, 0.5, most);
  if (cover <= 0.0) { outScene = vec4(back, FAR); return; }
  if (!hit) {
    // Find where it came nearest, and shade there.
    zh = uBox.z;
    float best = -1.0;
    for (float t = uBox.z - 0.5 * uCell; t > 0.0; t -= uCell) { float v = waxAt(vec3(q, t)); if (v > best) { best = v; zh = t; } }
  }
  vec3 p = vec3(q, zh);
  vec3 c = shade(p);
  // Wax further back sinks into the liquid's own light.
  float depth = (p.z - 0.5 * uBox.z) / uUnit;
  c = mix(back, c, exp(-max(-depth, 0.0) * 2.2 * uHaze));
  outScene = vec4(mix(back, c, cover), cover > 0.5 ? depth : FAR);
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
