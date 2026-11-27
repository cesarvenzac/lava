import { describe, expect, it } from "vitest";

import { DEFAULTS, settle } from "./options.ts";
import { PALETTE_NAMES, PALETTES, standInOf, toLinear } from "./palettes.ts";

describe("settle", () => {
  it("is every default when nothing's given", () => {
    const settings = settle({});
    expect(settings).toMatchObject(DEFAULTS);
    expect(settings.colours).toEqual(PALETTES.amber);
    expect(settings.mood).toBe("busy");
    expect(settings.reducedMotion).toBeNull();
  });

  it("keeps what an undefined option was, as React passes every prop", () => {
    const first = settle({ speed: 2, palette: "acid" });
    const next = settle({ speed: undefined, palette: undefined, gloss: 0.5 }, first);
    expect(next.speed).toBe(2);
    expect(next.colours).toEqual(PALETTES.acid);
    expect(next.gloss).toBe(0.5);
  });

  it("lays colours given over the palette's, and a palette chosen over colours given before", () => {
    const mine = settle({ palette: "violet", colours: { wax: "var(--brand)" } });
    expect(mine.colours).toEqual({ ...PALETTES.violet, wax: "var(--brand)" });
    expect(settle({ colours: { liquid: "black" } }, mine).colours).toEqual({ ...PALETTES.violet, wax: "var(--brand)", liquid: "black" });
    expect(settle({ palette: "ember" }, mine).colours).toEqual(PALETTES.ember);
  });

  it("holds numbers to their ranges, and ignores what isn't one", () => {
    const settings = settle({ speed: -3, aperture: 99, focus: Number.NaN, place: 2, maxPixels: 10 });
    expect(settings.speed).toBe(0);
    expect(settings.aperture).toBe(3);
    expect(settings.focus).toBe(DEFAULTS.focus);
    expect(settings.place).toBe(1);
    expect(settings.maxPixels).toBe(50_000);
    // @ts-expect-error A palette that isn't one falls back to the default.
    expect(settle({ palette: "plaid" }).palette).toBe("amber");
    // @ts-expect-error A mood that isn't one keeps the one before.
    expect(settle({ mood: "frantic" }, settle({ mood: "calm" })).mood).toBe("calm");
  });
});

describe("palettes", () => {
  it("are five, each a full set of colours", () => {
    expect(PALETTE_NAMES).toEqual(["amber", "magenta", "ember", "acid", "violet"]);
    for (const name of PALETTE_NAMES) expect(Object.keys(PALETTES[name]).sort()).toEqual(["hot", "light", "liquid", "wax"]);
  });

  it("are mixed in linear light", () => {
    expect(toLinear([0, 0.5, 1])).toEqual([0, expect.closeTo(0.214, 3), 1]);
  });

  it("stand in as the liquid lit from below", () => {
    const css = standInOf(PALETTES.amber);
    expect(css).toContain(PALETTES.amber.liquid);
    expect(css).toContain(PALETTES.amber.light);
    expect(css.startsWith("radial-gradient(")).toBe(true);
  });
});

describe("the view", () => {
  it("is the wax unless the simulation's particles are asked for", () => {
    expect(settle({}).view).toBe("wax");
    expect(settle({ view: "blobs" }).view).toBe("blobs");
    expect(settle({ view: "warmth" }, settle({ view: "blobs" })).view).toBe("warmth");
    // Anything else keeps what it was.
    expect(settle({ view: "x-ray" as never }, settle({ view: "blobs" })).view).toBe("blobs");
  });
});
