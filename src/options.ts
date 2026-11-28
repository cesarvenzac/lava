/**
 * A lamp's options, and what each is when it isn't given. Every number is held to a range it still
 * looks right in, so no setting can break the drawing.
 */

import type { View } from "./loop.ts";
import { type Colours, PALETTES, type PaletteName } from "./palettes.ts";
import type { Mood } from "./sim.ts";

/** The tank's shape: a lava lamp's, or the box's own. */
export type Shape = "lamp" | "box";

export type LavaOptions = {
  /** The colours it comes in: "amber" (the default), "magenta", "ember", "acid" or "violet". */
  palette?: PaletteName;
  /** Any of the palette's colours, as CSS colours (`var(--…)` included): the wax, its hot colour, the liquid and its light. */
  colours?: Partial<Colours>;
  /** "busy" (the default): a hotter lamp, plume after plume, blobs gathering under the top; or "calm", one plume at a time. */
  mood?: Mood;
  /**
   * The tank: "lamp" (the default), a lava lamp's, two and a half times as tall as it's wide, which a
   * box of another shape shows as much of as fits (`place`); or "box", a deep tank the box's own
   * shape (up to 16:9; a wider box shows a band of it), seen from in front, its whole width and
   * height shown, started again when the box's shape changes much.
   */
  shape?: Shape;
  /**
   * What's drawn: "wax" (the default), the lamp as it looks, through a lens; "section", a clean cut
   * through its middle, flat; or the simulation itself, its particles seen from the side, "blobs" each
   * blob in a colour of its own, "warmth" each particle by how warm it is.
   */
  view?: View;
  /** How fast it runs, 1 being a real lamp's pace; a slow device runs it slower than asked. */
  speed?: number;
  /**
   * Which part of the tank a box wider than it shows, 0 the pool to 1 the top; 0.5 by default. A box
   * as tall as the lamp, two and a half times its width, or taller, shows all of it, as a box no wider
   * than 16:9 shows all of a tank its own shape.
   */
  place?: number;
  /** How brightly the bulb lights the wax from below. */
  glow?: number;
  /** How much the brightest light spills round itself. */
  bloom?: number;
  /** How glossy the wax's skin is. */
  gloss?: number;
  /** How much light the picture takes in. */
  exposure?: number;
  /** How shallow the focus is: 0 for everything sharp. */
  aperture?: number;
  /**
   * Where the focus sits, from 0.5 nearer to -0.5 further, as shares of the tank's depth: 0 is the
   * middle of a lamp, and near the front of a box's tank, so its nearest blobs are sharp.
   */
  focus?: number;
  /** How far the wax further back sinks into the liquid's own light. */
  haze?: number;
  /** How much the wax's warmth colours it, hot wax fresh off the bulb glowing; 0 for none. */
  heat?: number;
  /** How strong the film's grain is. */
  grain?: number;
  /** What it is, said to assistive tech. */
  label?: string;
  /** Hold still: by default, whatever the visitor's system asks. */
  reducedMotion?: boolean;
  /** The most pixels drawn: a large box is drawn smaller and scaled up, which the soft image hides. */
  maxPixels?: number;
  /** Start held still. */
  paused?: boolean;
};

/** Every option's own value. */
export const DEFAULTS = {
  palette: "amber" as PaletteName,
  mood: "busy" as Mood,
  shape: "lamp" as Shape,
  view: "wax" as View,
  speed: 1,
  place: 0.5,
  glow: 1,
  bloom: 1,
  gloss: 1,
  exposure: 1,
  aperture: 1,
  focus: 0,
  haze: 1,
  heat: 1,
  grain: 1,
  label: "Wax glowing in a dark liquid, rising from a pool and sinking back, like a lava lamp's.",
  maxPixels: 800_000,
  paused: false,
};

/** What a lamp works from: every option given or its default, held to its range. */
export type Settings = typeof DEFAULTS & { colours: Colours; reducedMotion: boolean | null };

const RANGES: Partial<Record<keyof typeof DEFAULTS, [number, number]>> = {
  speed: [0, 3],
  place: [0, 1],
  glow: [0, 3],
  bloom: [0, 3],
  gloss: [0, 2],
  exposure: [0.1, 4],
  aperture: [0, 3],
  focus: [-0.5, 0.5],
  haze: [0, 3],
  heat: [0, 2],
  grain: [0, 3],
  maxPixels: [50_000, 8_000_000],
};

const within = (value: number, [lo, hi]: [number, number], otherwise: number) => (Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : otherwise);

/** The options given, laid over `before` (the defaults, if none): what a lamp then draws with. */
export function settle(options: LavaOptions, before?: Settings): Settings {
  const was: Settings = before ?? { ...DEFAULTS, colours: PALETTES[DEFAULTS.palette], reducedMotion: null };
  const next = { ...was } as Settings & Record<string, unknown>;
  for (const [key, value] of Object.entries(options)) {
    // React passes every prop, given or not: an option left undefined keeps what it was.
    if (value === undefined || key === "colours") continue;
    next[key] = value;
  }
  if (!(next.palette in PALETTES)) next.palette = DEFAULTS.palette;
  if (next.mood !== "busy" && next.mood !== "calm") next.mood = was.mood;
  if (next.view !== "wax" && next.view !== "section" && next.view !== "blobs" && next.view !== "warmth") next.view = was.view;
  if (next.shape !== "lamp" && next.shape !== "box") next.shape = was.shape;
  // A palette chosen replaces the colours; colours given are laid over it.
  const base = options.palette !== undefined ? PALETTES[next.palette] : was.colours;
  next.colours = { ...base, ...Object.fromEntries(Object.entries(options.colours ?? {}).filter(([, value]) => typeof value === "string" && value)) };
  const numbers = next as unknown as Record<string, unknown>;
  for (const [key, range] of Object.entries(RANGES) as [string, [number, number]][]) {
    const fallback = (was as unknown as Record<string, number>)[key];
    const value = numbers[key];
    numbers[key] = within(typeof value === "number" ? value : fallback, range, fallback);
  }
  return next;
}
