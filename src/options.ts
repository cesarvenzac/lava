/**
 * A lamp's options, and what each is when it isn't given. Every number is held to a range it still
 * looks right in, so no setting can break the drawing.
 */

import { type Colours, PALETTES, type PaletteName } from "./palettes.ts";

export type LavaOptions = {
  /** The colours it comes in: "amber" (the default), "magenta", "ember", "acid" or "violet". */
  palette?: PaletteName;
  /** Any of the palette's colours, as CSS colours (`var(--…)` included): the wax, its hot colour, the liquid and its light. */
  colours?: Partial<Colours>;
  /** The same seed lays out the same lamp. */
  seed?: string | number;
  /** How fast the wax moves, 1 being a lamp's own unhurried pace. */
  speed?: number;
  /** How many blobs; by default, more for a long box than a square one. */
  count?: number;
  /** How big the blobs are. */
  size?: number;
  /** How deep the pool lying on the bulb is, as a share of the box's shorter side; 0 for none. */
  pool?: number;
  /** How much slow waves move over the wax's surface. */
  wobble?: number;
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
  /** How deep the focus sits: 0 the middle, up to 0.5 nearer and -0.5 further. */
  focus?: number;
  /** How far the wax further back sinks into the liquid's own light. */
  haze?: number;
  /** How strong the film's grain is. */
  grain?: number;
  /** What it is, said to assistive tech. */
  label?: string;
  /** Hold still: by default, whatever the visitor's system asks. */
  reducedMotion?: boolean;
  /** Where in its seconds it starts. */
  start?: number;
  /** The most pixels drawn: a large box is drawn smaller and scaled up, which the soft image hides. */
  maxPixels?: number;
  /** Start held still. */
  paused?: boolean;
};

/** Every option's own value. */
export const DEFAULTS = {
  palette: "amber" as PaletteName,
  seed: "lava" as string | number,
  speed: 1,
  size: 1,
  pool: 0.12,
  wobble: 1,
  glow: 1,
  bloom: 1,
  gloss: 1,
  exposure: 1,
  aperture: 1,
  focus: 0,
  haze: 1,
  grain: 1,
  label: "Wax glowing in a dark liquid, rising from a pool and sinking back, like a lava lamp's.",
  start: 30,
  maxPixels: 800_000,
  paused: false,
};

/** What a lamp works from: every option given or its default, held to its range. */
export type Settings = typeof DEFAULTS & { colours: Colours; count: number | null; reducedMotion: boolean | null };

const RANGES: Partial<Record<keyof typeof DEFAULTS, [number, number]>> = {
  speed: [0, 10],
  size: [0.3, 2],
  pool: [0, 0.4],
  wobble: [0, 3],
  glow: [0, 3],
  bloom: [0, 3],
  gloss: [0, 2],
  exposure: [0.1, 4],
  aperture: [0, 3],
  focus: [-0.5, 0.5],
  haze: [0, 3],
  grain: [0, 3],
  maxPixels: [50_000, 8_000_000],
};

const within = (value: number, [lo, hi]: [number, number], otherwise: number) => (Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : otherwise);

/** The options given, laid over `before` (the defaults, if none): what a lamp then draws with. */
export function settle(options: LavaOptions, before?: Settings): Settings {
  const was: Settings = before ?? { ...DEFAULTS, colours: PALETTES[DEFAULTS.palette], count: null, reducedMotion: null };
  const next = { ...was } as Settings & Record<string, unknown>;
  for (const [key, value] of Object.entries(options)) {
    // React passes every prop, given or not: an option left undefined keeps what it was.
    if (value === undefined || key === "colours") continue;
    next[key] = value;
  }
  if (!(next.palette in PALETTES)) next.palette = DEFAULTS.palette;
  // A palette chosen replaces the colours; colours given are laid over it.
  const base = options.palette !== undefined ? PALETTES[next.palette] : was.colours;
  next.colours = { ...base, ...Object.fromEntries(Object.entries(options.colours ?? {}).filter(([, value]) => typeof value === "string" && value)) };
  const numbers = next as unknown as Record<string, unknown>;
  for (const [key, range] of Object.entries(RANGES) as [string, [number, number]][]) {
    const fallback = (was as unknown as Record<string, number>)[key];
    const value = numbers[key];
    numbers[key] = within(typeof value === "number" ? value : fallback, range, fallback);
  }
  if (next.count !== null && typeof next.count !== "number") next.count = null;
  if (typeof next.start !== "number" || !Number.isFinite(next.start)) next.start = DEFAULTS.start;
  return next;
}
