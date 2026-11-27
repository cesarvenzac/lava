/**
 * A lava lamp in any element:
 *
 *   import { lava } from "@cesarvenzac/lava";
 *
 *   const lamp = lava(document.querySelector(".hero"), { palette: "magenta" });
 *   lamp.set({ mood: "calm" });
 *   lamp.destroy();
 *
 * The lamp is simulated, its wax thousands of particles in 3D (sim.ts), in a worker so the page
 * stays free; it starts from a lamp already running. Its wax is drawn on a canvas laid under the
 * element's own content, filling it as a picture does with `object-fit: cover`: a box as tall as
 * the lamp or taller shows all of it, a wider one a band, which `place` chooses. Until the first
 * frame is drawn (and where a browser can't draw it at all) the element shows the liquid lit from
 * below, as a CSS background, and the drawing fades in over it. It runs only while it's on screen
 * and the tab is shown, and holds still where the visitor's system asks for less motion. Where it
 * stands is the element's `data-lava`: "waiting" for its shaders and its first field, "drawing", or
 * "unavailable" where the browser can't draw it.
 */

import { BOX, type Look, type Readiness, rendererFor, type View } from "./gl.ts";
import type { Sent } from "./loop.ts";
import { type LavaOptions, type Settings, settle } from "./options.ts";
import { standInOf, toLinear } from "./palettes.ts";
import { runnerOf } from "./runner.ts";

export type Lava = {
  /** The element it's drawn in. */
  readonly element: HTMLElement;
  /** Changes any option; the others stay as they are. */
  set(options: LavaOptions): void;
  play(): void;
  pause(): void;
  /** Seconds of the lamp's own time so far. */
  readonly time: number;
  /** How many of the lamp's seconds pass in a real one, lately: below `speed` where the device can't keep up. */
  readonly rate: number;
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
    glow: settings.glow,
    gloss: settings.gloss,
    haze: settings.haze,
    heat: settings.heat,
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

/** What a box of this shape shows of the lamp: all its width, and as much of its height as fits, at `place`. */
export function viewOf(aspect: number, place: number): View {
  const lamp = BOX[0] / BOX[1];
  if (aspect >= lamp) {
    const height = BOX[0] / aspect;
    return { x: 0, y: place * (BOX[1] - height), width: BOX[0], height };
  }
  const width = aspect * BOX[1];
  return { x: (BOX[0] - width) / 2, y: 0, width, height: BOX[1] };
}

export function lava(element: HTMLElement, options: LavaOptions = {}): Lava {
  let settings = settle(options);
  let look = lookOf(settings, element);
  let time = 0;
  let rate = 0;

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

  // The fields: each into the slot the one before isn't in, the picture moving toward it over the
  // time it took to come.
  let fields = 0, newest: 0 | 1 = 1, arrived = 0, gap = 1 / 20;
  const runner = runnerOf((sent: Sent) => {
    if (destroyed) return;
    const slot: 0 | 1 = newest === 0 ? 1 : 0;
    renderer.upload(slot, sent.wax, sent.heat, sent.dims);
    if (!fields) renderer.upload(newest, sent.wax, sent.heat, sent.dims);
    const now = performance.now();
    if (fields) gap = Math.max(0.02, Math.min(0.5, (now - arrived) / 1000));
    arrived = now;
    newest = slot;
    fields++;
    time = sent.time;
    rate = sent.rate;
    request();
  });
  let running = moving();
  runner.start(settings.mood, settings.speed, running);
  const follow = () => {
    const now = moving();
    if (now !== running) {
      running = now;
      runner.set({ running });
    }
  };

  function draw(readiness: Readiness, now: number) {
    if (readiness !== "ready" || !size.width || !fields) return false;
    const toward = Math.min(1, (now - arrived) / 1000 / gap);
    renderer.draw(viewOf(size.width / size.height, settings.place), look, now / 1000, frames, newest === 1 ? toward : 1 - toward);
    if (!shown) {
      shown = true;
      canvas.style.opacity = "1";
      element.dataset.lava = "drawing";
    }
    return toward < 1;
  }

  function tick(now: number) {
    raf = 0;
    if (destroyed) return;
    follow();
    const readiness = renderer.poll();
    if (readiness === "unavailable") {
      element.dataset.lava = "unavailable";
      runner.set({ running: (running = false) });
      return;
    }
    if (readiness === "waiting" || !fields) {
      // The shaders are still being made, or the first field hasn't come: ask again next frame,
      // which never waits.
      raf = requestAnimationFrame(tick);
      return;
    }
    if (running) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
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
      draw(readiness, now);
      raf = requestAnimationFrame(tick);
    } else {
      last = 0;
      // Still, it draws only when asked or while a field comes in, blended in over a few frames.
      if (draw(readiness, now)) raf = requestAnimationFrame(tick);
    }
  }
  function request() {
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
    look = lookOf(settings, element);
    paintStandIn();
    if (labelled && settings.label !== before.label) element.setAttribute("aria-label", settings.label);
    if (settings.maxPixels !== before.maxPixels) resize(true);
    if (settings.mood !== before.mood) {
      // Another lamp: started from its own warm start.
      running = moving();
      runner.start(settings.mood, settings.speed, running);
    } else if (settings.speed !== before.speed) runner.set({ speed: settings.speed });
    request();
  }

  return {
    element,
    set,
    play: () => set({ paused: false }),
    pause: () => set({ paused: true }),
    get time() {
      return time;
    },
    get rate() {
      return rate;
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
      runner.destroy();
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
