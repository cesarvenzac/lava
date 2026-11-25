/**
 * The colours wax is drawn in: the wax itself, the hot colour it glows toward where it's thin and
 * lit, the liquid round it, and the light the bulb casts into that liquid from below. Any CSS
 * colour will do; these are the lamps it comes with, each wax on a dark liquid.
 */

export type Colours = {
  /** The wax, where it's deep. */
  wax: string;
  /** What the wax glows toward where it's thin and the bulb lights it. */
  hot: string;
  /** The liquid, in the dark. */
  liquid: string;
  /** The bulb's light in the liquid, rising from the bottom. */
  light: string;
};

export const PALETTES = {
  amber: { wax: "oklch(58% 0.2 38)", hot: "oklch(88% 0.15 82)", liquid: "oklch(15% 0.06 325)", light: "oklch(44% 0.19 340)" },
  magenta: { wax: "oklch(55% 0.24 355)", hot: "oklch(86% 0.12 30)", liquid: "oklch(14% 0.05 270)", light: "oklch(42% 0.16 265)" },
  ember: { wax: "oklch(52% 0.2 30)", hot: "oklch(86% 0.14 65)", liquid: "oklch(14% 0.045 25)", light: "oklch(36% 0.13 32)" },
  acid: { wax: "oklch(70% 0.19 138)", hot: "oklch(95% 0.15 112)", liquid: "oklch(15% 0.04 215)", light: "oklch(42% 0.09 200)" },
  violet: { wax: "oklch(52% 0.2 302)", hot: "oklch(86% 0.1 330)", liquid: "oklch(13% 0.035 282)", light: "oklch(44% 0.12 240)" },
} as const satisfies Record<string, Colours>;

export type PaletteName = keyof typeof PALETTES;

/** The palettes' names, in the order above. */
export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

/** A colour in sRGB, each channel from 0 to 1, as the linear light the shader mixes in. */
export function toLinear([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const channel = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return [channel(r), channel(g), channel(b)];
}

/**
 * The liquid lit from below, as a CSS background: what a lamp shows until its wax is drawn, on a
 * server, and wherever a browser can't draw it.
 */
export function standInOf(colours: Pick<Colours, "liquid" | "light">): string {
  return `radial-gradient(130% 75% at 50% 118%, color-mix(in oklab, ${colours.light} 88%, transparent) 0%, transparent 72%), ${colours.liquid}`;
}
