import { describe, expect, it } from "vitest";

import { currentsAt, lampOf, MOODS, relabel, step } from "./sim.ts";

describe("the simulation", { timeout: 30_000 }, () => {
  const lamp = lampOf(MOODS.busy);
  for (let k = 0; k < 120; k++) step(lamp);

  it("starts as a settled pool of about the particles asked for", () => {
    const fresh = lampOf(MOODS.busy);
    expect(fresh.n).toBeGreaterThan(7500);
    expect(fresh.n).toBeLessThan(8200);
    expect(Math.max(...fresh.y)).toBeLessThan(0.2);
    expect(fresh.time).toBe(0);
  });

  it("keeps every particle inside the lamp, and every number finite", () => {
    const W = lamp.params.width;
    for (let i = 0; i < lamp.n; i++) {
      expect(lamp.x[i]).toBeGreaterThanOrEqual(0);
      expect(lamp.x[i]).toBeLessThanOrEqual(W);
      expect(lamp.y[i]).toBeGreaterThanOrEqual(0);
      expect(lamp.y[i]).toBeLessThanOrEqual(1);
      expect(lamp.z[i]).toBeLessThanOrEqual(W);
      expect(Number.isFinite(lamp.vy[i] + lamp.t[i])).toBe(true);
    }
    expect(lamp.time).toBeCloseTo(2, 5);
  });

  it("is the same lamp every time", () => {
    const again = lampOf(MOODS.busy);
    for (let k = 0; k < 120; k++) step(again);
    expect(Array.from(again.y.slice(0, 50))).toEqual(Array.from(lamp.y.slice(0, 50)));
  });

  it("heats the wax over the coil", () => {
    // Held steady: the swell starts at nothing.
    const hot = lampOf({ ...MOODS.busy, pulse: 0 });
    for (let k = 0; k < 120; k++) step(hot);
    expect(Math.max(...hot.t)).toBeGreaterThan(55);
  }, 30_000);
});

describe("blobs", () => {
  /** Two clumps of particles, a gap of `apart` spacings between them. */
  const twoClumps = (apart: number) => {
    const lamp = lampOf(MOODS.busy, false);
    const sp = lamp.spacing;
    let k = 0;
    for (const [cx, side] of [[0.12, 0], [0.12 + 6 * sp + apart * sp, 1]] as const)
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 6; j++)
          for (let m = 0; m < 6; m++) {
            lamp.x[k] = cx + i * sp;
            lamp.y[k] = 0.5 + j * sp;
            lamp.z[k] = 0.2 + m * sp;
            lamp.body[k] = 0;
            void side;
            k++;
          }
    (lamp as { n: number }).n = k;
    return lamp;
  };

  it("part when their neck has broken, and stay apart until they've touched long enough", () => {
    const lamp = twoClumps(4);
    step(lamp);
    const labels = new Set(Array.from(lamp.body.slice(0, lamp.n)));
    expect(labels.size).toBe(2);
  });

  it("run together once they've touched for the drainage time", () => {
    const lamp = twoClumps(0.9);
    lamp.params = { ...lamp.params, lift: 0, heat: 0, currents: 0, drain: 0.2 };
    // Two labels touching from the start.
    for (let i = lamp.n / 2; i < lamp.n; i++) lamp.body[i] = 1;
    lamp.bodies = 2;
    for (let k = 0; k < 6; k++) relabel(lamp, 0.1);
    expect(new Set(Array.from(lamp.body.slice(0, lamp.n))).size).toBe(1);
  });
});

describe("the liquid's currents", () => {
  it("neither gather liquid nor thin it anywhere", () => {
    const p = MOODS.busy, e = 1e-4, at = [0.13, 0.37, 0.24], t = 5;
    const f = (x: number, y: number, z: number) => currentsAt(p, x, y, z, t);
    const div =
      (f(at[0] + e, at[1], at[2])[0] - f(at[0] - e, at[1], at[2])[0] + f(at[0], at[1] + e, at[2])[1] - f(at[0], at[1] - e, at[2])[1] + f(at[0], at[1], at[2] + e)[2] - f(at[0], at[1], at[2] - e)[2]) / (2 * e);
    expect(Math.abs(div)).toBeLessThan(1e-6);
  });

  it("move at about the speed asked", () => {
    let sum = 0;
    for (let i = 0; i < 400; i++) sum += Math.hypot(...currentsAt(MOODS.busy, (i % 7) * 0.05, (i % 11) * 0.09, (i % 5) * 0.08, i * 0.3));
    expect(sum / 400).toBeGreaterThan(0.015);
    expect(sum / 400).toBeLessThan(0.045);
  });
});
