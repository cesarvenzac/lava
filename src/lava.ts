/**
 * A lava lamp in any element:
 *
 *   import { lava } from "@cesarvenzac/lava";
 *
 *   const lamp = lava(document.querySelector(".hero"), { palette: "magenta" });
 *   lamp.set({ speed: 1.5 });
 *   lamp.destroy();
 *
 * The wax is drawn on a canvas laid under the element's own content, filling it. Until the first
 * frame is drawn (and where a browser can't draw it at all) the element shows the liquid lit from
 * below, as a CSS background, and the drawing fades in over it. It moves only while it's on
 * screen and the tab is shown, and holds still where the visitor's system asks for less motion.
 * Where it stands is the element's `data-lava`: "waiting" for its shaders, "drawing", or
 * "unavailable" where the browser can't draw it.
 */

import { type Look, type Readiness, rendererFor } from "./gl.ts";
import { countFor, frameOf, place } from "./motion.ts";
import { type LavaOptions, type Settings, settle } from "./options.ts";
import { standInOf, toLinear } from "./palettes.ts";
import { planOf } from "./plan.ts";

export type Lava = {
  /** The element it's drawn in. */
  readonly element: HTMLElement;
  /** Changes any option; the others stay as they are. */
  set(options: LavaOptions): void;
  play(): void;
  pause(): void;
  /** Moves to a moment, in seconds of its own motion, and draws it, paused or not. */
  seek(time: number): void;
  /** Seconds into its motion. */
  readonly time: number;
  /** Whether it's drawing yet: until then, and if it never can, its stand-in shows. */
  readonly drawing: boolean;
  /** Takes it out of the element and gives back everything it changed there. */
  destroy(): void;
};

type Rgb = readonly [number, number, number];
let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour (`var(--name)` read off the element) as sRGB, from a pixel of it painted. */
function rgbOf(css: string, element: HTMLElement): Rgb {
  let value = css.trim();
  const variable = /^var\(\s*(--[^,\s)]+)\s*(?:,\s*(.+))?\)$/.exec(value);
  if (variable) value = getComputedStyle(element).getPropertyValue(variable[1]).trim() || (variable[2] ?? "").trim() || "black";
  if (!probe) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

function lookOf(settings: Settings, element: HTMLElement): Look {
  const linear = (css: string) => toLinear(rgbOf(css, element));
  const { colours } = settings;
  return {
    wax: linear(colours.wax),
    hot: linear(colours.hot),
    liquid: linear(colours.liquid),
    light: linear(colours.light),
    pool: settings.pool,
    wobble: settings.wobble,
    glow: settings.glow,
    gloss: settings.gloss,
    haze: settings.haze,
    aperture: settings.aperture,
    focus: settings.focus,
    bloom: settings.bloom,
    exposure: settings.exposure,
    grain: settings.grain,
  };
}

/** Frames judged before the drawing may be made smaller, how slow is too slow, and how far it may go. */
const JUDGED = 120;
const SLOW = 50;
const LOWER = 0.78;
const LOWEST = 2;

export function lava(element: HTMLElement, options: LavaOptions = {}): Lava {
  let settings = settle(options);
  let plan = planOf(settings.seed);
  let time = settings.start;
  let look = lookOf(settings, element);
  const frame = frameOf();

  // What it changes on the element, to give back.
  const was = {
    position: element.style.position,
    isolation: element.style.isolation,
    background: element.style.background,
    role: element.getAttribute("role"),
    label: element.getAttribute("aria-label"),
    state: element.dataset.lava,
  };
  element.dataset.lava = "waiting";
  if (getComputedStyle(element).position === "static") element.style.position = "relative";
  // Its own stacking context, so the canvas can lie under the element's content and over its background.
  element.style.isolation = "isolate";
  const paintStandIn = () => {
    element.style.background = standInOf(settings.colours);
  };
  paintStandIn();
  // A lamp on its own is a picture; one behind content is that content's background, and says nothing.
  const labelled = !element.hasAttribute("role") && element.childElementCount === 0;
  if (labelled) {
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", settings.label);
  }

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.lavaCanvas = "";
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    zIndex: "-1",
    pointerEvents: "none",
    borderRadius: "inherit",
    opacity: "0",
    transition: "opacity 700ms cubic-bezier(0.23, 1, 0.32, 1)",
  });
  element.prepend(canvas);

  let destroyed = false;
  let raf = 0;
  let last = 0;
  let frames = 0;
  let fps = 60;
  let judged = 0;
  let lowered = 0;
  let quality = 1;
  let shown = false;
  let onScreen = true;
  let size = { width: 0, height: 0, sceneHeight: 1 };
  const renderer = rendererFor(canvas, () => request());

  function resize(force = false) {
    const rect = element.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (!force && width === size.width && height === size.height) return;
    // Rendered at up to `maxPixels`, then scaled up to the screen's: the soft picture hides it.
    const k = Math.min(1, Math.sqrt(settings.maxPixels / (width * height))) * quality;
    const sceneWidth = Math.max(1, Math.round(width * k));
    const sceneHeight = Math.max(1, Math.round(height * k));
    size = { width, height, sceneHeight };
    renderer.size(width, height, sceneWidth, sceneHeight);
    request();
  }

  const reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const still = () => settings.reducedMotion ?? reduce?.matches ?? false;
  const moving = () => !destroyed && onScreen && !document.hidden && !settings.paused && !still();

  function draw(readiness: Readiness) {
    if (readiness !== "ready" || !size.width) return;
    const aspect = size.width / size.height;
    place(plan, time, { aspect, pool: settings.pool, size: settings.size, count: countFor(aspect, settings.count), pixel: 1 / size.sceneHeight }, frame);
    renderer.draw(frame, look, time, frames);
    if (!shown) {
      shown = true;
      canvas.style.opacity = "1";
      element.dataset.lava = "drawing";
    }
  }

  let pending = false;
  function tick(now: number) {
    raf = 0;
    if (destroyed) return;
    const readiness = renderer.poll();
    if (readiness === "unavailable") {
      element.dataset.lava = "unavailable";
      return;
    }
    if (readiness === "waiting") {
      // The shaders are still being made: ask again next frame, which never waits.
      raf = requestAnimationFrame(tick);
      return;
    }
    if (moving()) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      time += dt * settings.speed;
      frames++;
      if (dt > 0) fps += (1 / dt - fps) * 0.04;
      // Drawn smaller, at most twice and only early on, if frames come slowly: never a change of
      // sharpness in the middle of watching.
      if (++judged === JUDGED && lowered < LOWEST && fps < SLOW) {
        quality *= LOWER;
        lowered++;
        judged = 0;
        resize(true);
      }
      draw(readiness);
      raf = requestAnimationFrame(tick);
    } else {
      last = 0;
      if (pending) draw(readiness);
    }
    pending = false;
  }
  function request() {
    pending = true;
    if (!raf && !destroyed) raf = requestAnimationFrame(tick);
  }

  const resized = new ResizeObserver(() => resize());
  resized.observe(element);
  const seen = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
        onScreen = entries[entries.length - 1].isIntersecting;
        request();
      })
    : null;
  seen?.observe(element);
  const onVisibility = () => request();
  document.addEventListener("visibilitychange", onVisibility);
  reduce?.addEventListener("change", onVisibility);
  resize(true);

  function set(next: LavaOptions) {
    if (destroyed) return;
    const before = settings;
    settings = settle(next, settings);
    if (settings.seed !== before.seed) plan = planOf(settings.seed);
    if (next.start !== undefined) time = settings.start;
    look = lookOf(settings, element);
    paintStandIn();
    if (labelled && settings.label !== before.label) element.setAttribute("aria-label", settings.label);
    if (settings.maxPixels !== before.maxPixels) resize(true);
    request();
  }

  return {
    element,
    set,
    play: () => set({ paused: false }),
    pause: () => set({ paused: true }),
    seek(to) {
      if (Number.isFinite(to)) time = to;
      request();
    },
    get time() {
      return time;
    },
    get drawing() {
      return shown;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      resized.disconnect();
      seen?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduce?.removeEventListener("change", onVisibility);
      renderer.destroy();
      canvas.remove();
      element.style.position = was.position;
      element.style.isolation = was.isolation;
      element.style.background = was.background;
      if (was.state === undefined) delete element.dataset.lava;
      else element.dataset.lava = was.state;
      if (labelled) {
        if (was.role === null) element.removeAttribute("role");
        if (was.label === null) element.removeAttribute("aria-label");
      }
    },
  };
}
