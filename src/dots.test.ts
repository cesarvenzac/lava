import { describe, expect, it } from "vitest";

import { dotColoursOf, lchOf, rgbOfLch } from "./dots.ts";
import { BLOB_COLOURS } from "./loop.ts";

const amber = { wax: [0.86, 0.36, 0.2], hot: [1, 0.85, 0.55], liquid: [0.09, 0.03, 0.08], light: [0.55, 0.1, 0.4] } as const;

describe("the particles' colours", () => {
  it("turn sRGB into OKLCH and back", () => {
    for (const rgb of [[0.86, 0.36, 0.2], [0.2, 0.6, 0.9], [0.5, 0.5, 0.5]] as const) {
      const back = rgbOfLch(...lchOf(rgb));
      back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 4));
    }
  });

  it("keep a colour out of gamut by giving up chroma, not lightness", () => {
    const rgb = rgbOfLch(0.8, 0.4, 145);
    for (const v of rgb) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(lchOf(rgb)[0]).toBeCloseTo(0.8, 2);
  });

  it("give every blob a hue of its own, all as light as each other, and the pool a muted one", () => {
    const { colours } = dotColoursOf(amber);
    expect(colours.length).toBe(BLOB_COLOURS * 3);
    const at = (k: number) => lchOf([colours[3 * k], colours[3 * k + 1], colours[3 * k + 2]]);
    const pool = at(0);
    expect(pool[1]).toBeLessThan(0.08);
    for (let k = 1; k < BLOB_COLOURS; k++) {
      expect(at(k)[0]).toBeCloseTo(0.8, 2);
      // The next blob's hue is far round the wheel from this one's.
      if (k > 1) {
        const d = Math.abs(at(k)[2] - at(k - 1)[2]) % 360;
        expect(Math.min(d, 360 - d)).toBeGreaterThan(60);
      }
    }
  });

  it("ramp warmth from cool through the wax to its hot colour, on the liquid", () => {
    const look = dotColoursOf(amber);
    expect(lchOf(look.cold)[0]).toBeLessThan(lchOf(look.hot)[0]);
    expect(look.hot).toEqual(amber.hot);
    expect(look.back).toEqual(amber.liquid);
  });
});
