/**
 * The colours a lamp's particles are drawn in, from its palette: by blob, the pool in a muted tone of
 * the bulb's light and each blob in a hue of its own, the next one round the colour wheel by the golden
 * angle from the wax's, so blobs side by side never look alike; by warmth, a ramp from cool, in the
 * light's hue, through the wax to its hot colour. Worked out in OKLCH, so every blob is as light as
 * the next, and brought into sRGB by giving up chroma, never lightness.
 *
 * Pure: no DOM. Colours are sRGB, each channel 0 to 1, as they're shown.
 */

import { BLOB_COLOURS } from "./loop.ts";

type Rgb = readonly [number, number, number];

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** A colour in sRGB as OKLCH: lightness 0 to 1, chroma, hue in degrees. */
export function lchOf([r, g, b]: Rgb): [number, number, number] {
  const R = linear(r), G = linear(g), B = linear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(Bb, A) * 180) / Math.PI;
  return [L, Math.hypot(A, Bb), h < 0 ? h + 360 : h];
}

/** OKLCH as sRGB, unclipped: a channel outside 0 to 1 is out of gamut. */
function rawRgb(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const inGamut = (c: number[]) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH as sRGB, chroma given up until it fits. */
export function rgbOfLch(L: number, C: number, h: number): [number, number, number] {
  let rgb = rawRgb(L, C, h);
  if (!inGamut(rgb)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(rawRgb(L, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = rawRgb(L, lo, h);
  }
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

/** Cool wax's hue, whatever the palette. */
const COLD = 250;

/** The golden angle: each blob's hue this far round from the one before. */
const GOLDEN = 137.50776;

export type DotColours = { colours: Float32Array; cold: Rgb; mid: Rgb; hot: Rgb; back: Rgb };

/** The particles' colours for a palette given as sRGB: its wax, hot colour, liquid and light. */
export function dotColoursOf(palette: { wax: Rgb; hot: Rgb; liquid: Rgb; light: Rgb }): DotColours {
  const wax = lchOf(palette.wax), light = lchOf(palette.light);
  const colours = new Float32Array(BLOB_COLOURS * 3);
  colours.set(rgbOfLch(0.66, 0.07, light[2]), 0);
  for (let k = 1; k < BLOB_COLOURS; k++) colours.set(rgbOfLch(0.8, 0.13, (wax[2] + k * GOLDEN) % 360), 3 * k);
  return {
    colours,
    cold: rgbOfLch(0.6, 0.13, COLD),
    mid: rgbOfLch(Math.max(0.6, wax[0]), wax[1], wax[2]),
    hot: palette.hot,
    back: palette.liquid,
  };
}
