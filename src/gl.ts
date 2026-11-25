/**
 * A lamp's WebGL 2 side: its context, its five programs and their targets, and drawing a frame.
 *
 * The programs are compiled without holding up the page: where the driver compiles on the side
 * (`KHR_parallel_shader_compile`) each frame asks whether it's done, which never waits; elsewhere
 * they're finished once the page is idle. Until then, and where there's no WebGL 2 or no float
 * target to draw into, the lamp shows its stand-in. A context lost is waited out and made again.
 */

import type { Frame } from "./motion.ts";
import { DOWN, FILM, FOCUS, SCENE, UP, VERTEX } from "./shaders.ts";

type Rgb = readonly [number, number, number];

/** What a frame is drawn with, besides where the wax is: colours in linear light, and the knobs. */
export type Look = {
  wax: Rgb;
  hot: Rgb;
  liquid: Rgb;
  light: Rgb;
  pool: number;
  wobble: number;
  glow: number;
  gloss: number;
  haze: number;
  aperture: number;
  focus: number;
  bloom: number;
  exposure: number;
  grain: number;
};

export type Readiness = "waiting" | "ready" | "unavailable";

export type Renderer = {
  /** Moves a waiting compile on, and says where it stands. Never waits. */
  poll(): Readiness;
  /** What's shown, and what's rendered before it's scaled up to that. */
  size(width: number, height: number, sceneWidth: number, sceneHeight: number): void;
  draw(frame: Frame, look: Look, time: number, index: number): void;
  destroy(): void;
};

type Program = { program: WebGLProgram; at: Record<string, WebGLUniformLocation | null> };
type Target = { texture: WebGLTexture; buffer: WebGLFramebuffer; width: number; height: number };
type Compiling = { programs: WebGLProgram[]; shaders: WebGLShader[] };

const FRAGMENTS = { scene: SCENE, focus: FOCUS, down: DOWN, up: UP, film: FILM };
type Name = keyof typeof FRAGMENTS;

const later = (step: () => void) => {
  if (typeof requestIdleCallback === "function") requestIdleCallback(step, { timeout: 800 });
  else setTimeout(step, 60);
};

/** A renderer drawing into `canvas`; `changed` is called when it becomes ready again after a loss. */
export function rendererFor(canvas: HTMLCanvasElement, changed: () => void): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  let readiness: Readiness = "waiting";
  let programs: Record<Name, Program> | null = null;
  let compiling: Compiling | null = null;
  let parallel: { COMPLETION_STATUS_KHR: number } | null = null;
  let idleDone = false;
  let vao: WebGLVertexArrayObject | null = null;
  let scene: Target | null = null;
  let focused: Target | null = null;
  let bloom: Target[] = [];
  let sizes = { width: 1, height: 1, sceneWidth: 1, sceneHeight: 1 };

  function start() {
    if (!gl || gl.isContextLost()) return;
    if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) {
      readiness = "unavailable";
      return;
    }
    parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertex, VERTEX);
    gl.compileShader(vertex);
    const shaders = [vertex];
    const made: WebGLProgram[] = [];
    for (const source of Object.values(FRAGMENTS)) {
      const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fragment, source);
      gl.compileShader(fragment);
      const program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      shaders.push(fragment);
      made.push(program);
    }
    compiling = { programs: made, shaders };
    idleDone = false;
    if (!parallel) later(() => (idleDone = true));
    readiness = "waiting";
  }

  function finish(): Readiness {
    if (!gl || !compiling) return readiness;
    const done = parallel ? compiling.programs.every((program) => gl.getProgramParameter(program, parallel!.COMPLETION_STATUS_KHR)) : idleDone;
    if (!done) return "waiting";
    const names = Object.keys(FRAGMENTS) as Name[];
    const result = {} as Record<Name, Program>;
    for (const [i, program] of compiling.programs.entries()) {
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("lava: a shader didn't compile", gl.getProgramInfoLog(program), ...compiling.shaders.map((shader) => gl.getShaderInfoLog(shader)).filter(Boolean));
        compiling = null;
        return (readiness = "unavailable");
      }
      const at: Program["at"] = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
      for (let u = 0; u < count; u++) {
        const info = gl.getActiveUniform(program, u);
        if (info) at[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, info.name);
      }
      result[names[i]] = { program, at };
    }
    for (const shader of compiling.shaders) gl.deleteShader(shader);
    compiling = null;
    programs = result;
    vao = gl.createVertexArray();
    makeTargets();
    return (readiness = "ready");
  }

  function target(width: number, height: number): Target {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA16F, width, height, 0, gl!.RGBA, gl!.HALF_FLOAT, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    const buffer = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, buffer);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, texture, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    return { texture, buffer, width, height };
  }
  const release = (t: Target | null) => {
    if (!t || !gl) return;
    gl.deleteTexture(t.texture);
    gl.deleteFramebuffer(t.buffer);
  };

  function makeTargets() {
    if (!gl || !programs) return;
    [scene, focused, ...bloom].forEach(release);
    const { sceneWidth: w, sceneHeight: h } = sizes;
    scene = target(w, h);
    focused = target(w, h);
    bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < 5 && bw > 4 && bh > 4; i++) {
      bw = Math.max(1, Math.floor(bw / 2));
      bh = Math.max(1, Math.floor(bh / 2));
      bloom.push(target(bw, bh));
    }
  }

  function pass(program: Program, out: Target | null, width: number, height: number) {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, out ? out.buffer : null);
    gl!.viewport(0, 0, width, height);
    gl!.useProgram(program.program);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }
  function texture(program: Program, name: string, unit: number, t: WebGLTexture) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, t);
    gl!.useProgram(program.program);
    gl!.uniform1i(program.at[name], unit);
  }

  const onLost = (event: Event) => {
    event.preventDefault();
    readiness = "waiting";
    programs = null;
    compiling = null;
    scene = focused = null;
    bloom = [];
  };
  const onRestored = () => {
    start();
    changed();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  if (gl) start();
  else readiness = "unavailable";

  return {
    poll() {
      if (readiness === "waiting" && compiling) return finish();
      return readiness;
    },
    size(width, height, sceneWidth, sceneHeight) {
      const before = sizes;
      sizes = { width, height, sceneWidth, sceneHeight };
      canvas.width = width;
      canvas.height = height;
      if (before.sceneWidth !== sceneWidth || before.sceneHeight !== sceneHeight || !scene) makeTargets();
    },
    draw(frame, look, time, index) {
      if (!gl || !programs || !scene || !focused || gl.isContextLost()) return;
      const { width, height, sceneWidth: sw, sceneHeight: sh } = sizes;
      gl.bindVertexArray(vao);
      const unit = Math.min(1, width / height);
      // The scene.
      const s = programs.scene, u = s.at;
      gl.useProgram(s.program);
      gl.uniform2f(u.uRes, sw, sh);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uUnit, unit);
      gl.uniform4fv(u.uBlob, frame.blobs);
      gl.uniform4fv(u.uTail, frame.tails);
      gl.uniform4fv(u.uBound, frame.bounds);
      gl.uniform4fv(u.uShape, frame.shapes);
      gl.uniform4fv(u.uNeck, frame.necks);
      gl.uniform4fv(u.uRoot, frame.roots);
      gl.uniform4fv(u.uMound, frame.mounds);
      gl.uniform1i(u.uMounds, frame.count);
      gl.uniform1f(u.uPoolReach, frame.poolReach);
      gl.uniform1i(u.uCount, frame.count);
      gl.uniform1f(u.uPool, look.pool);
      gl.uniform1f(u.uWobble, look.wobble);
      gl.uniform3f(u.uWax, ...look.wax);
      gl.uniform3f(u.uHeat, ...look.hot);
      gl.uniform3f(u.uLiquid, ...look.liquid);
      gl.uniform3f(u.uLight, ...look.light);
      gl.uniform1f(u.uGlow, look.glow);
      gl.uniform1f(u.uGloss, look.gloss);
      gl.uniform1f(u.uHaze, look.haze);
      pass(s, scene, sw, sh);
      // Its depth of field: blurs up to about 2% of its height across, never fewer than some thirty samples.
      const f = programs.focus;
      texture(f, "uScene", 0, scene.texture);
      gl.uniform2f(f.at.uTexel, 1 / sw, 1 / sh);
      gl.uniform1f(f.at.uFocus, look.focus);
      gl.uniform1f(f.at.uAperture, look.aperture * sh * 0.045);
      const most = look.aperture > 0 ? Math.min(sh * 0.022 * Math.min(look.aperture, 1.4), 22) : 0;
      gl.uniform1f(f.at.uMost, most);
      gl.uniform1f(f.at.uStride, Math.min(1.6, Math.max(0.3, (most * most) / 60)));
      pass(f, focused, sw, sh);
      // Its bloom, down and back up.
      const d = programs.down;
      let from = focused;
      bloom.forEach((level, i) => {
        texture(d, "uFrom", 0, from.texture);
        gl.uniform2f(d.at.uTexel, 1 / from.width, 1 / from.height);
        gl.uniform2f(d.at.uOut, 1 / level.width, 1 / level.height);
        gl.uniform1i(d.at.uFirst, i === 0 ? 1 : 0);
        pass(d, level, level.width, level.height);
        from = level;
      });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      const up = programs.up;
      for (let i = bloom.length - 2; i >= 0; i--) {
        texture(up, "uFrom", 0, bloom[i + 1].texture);
        gl.uniform2f(up.at.uTexel, 1 / bloom[i + 1].width, 1 / bloom[i + 1].height);
        gl.uniform2f(up.at.uOut, 1 / bloom[i].width, 1 / bloom[i].height);
        pass(up, bloom[i], bloom[i].width, bloom[i].height);
      }
      gl.disable(gl.BLEND);
      // The film.
      const film = programs.film;
      texture(film, "uImage", 0, focused.texture);
      texture(film, "uBloom", 1, bloom[0] ? bloom[0].texture : focused.texture);
      gl.uniform2f(film.at.uRes, width, height);
      gl.uniform1f(film.at.uBloomAmount, bloom[0] ? look.bloom : 0);
      gl.uniform1f(film.at.uExposure, look.exposure);
      gl.uniform1f(film.at.uGrain, look.grain);
      gl.uniform1f(film.at.uFrame, index % 1000);
      pass(film, null, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
    },
    destroy() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (!gl) return;
      [scene, focused, ...bloom].forEach(release);
      if (programs) for (const program of Object.values(programs)) gl.deleteProgram(program.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
