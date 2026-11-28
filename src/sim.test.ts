import { describe, expect, it } from "vitest";

import { coilsOf, currentsAt, DEEP, lampOf, MOODS, relabel, spacingOf, step, tankOf, WIDEST, withRoom } from "./sim.ts";

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
    const hot = lampOf(MOODS.busy);
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

describe("necks parting", { timeout: 60_000 }, () => {
  // A lamp with nothing moving it: no lift, no heat, no currents. Its first particles are laid out
  // as `shape` (points in spacings about the middle, packed a little closer than the wax rests, so
  // they have neighbours all round), one blob; the rest stay in the pool, a blob of their own.
  const still = (shape: [number, number, number][], over: Partial<typeof MOODS.busy> = {}) => {
    const params = { ...MOODS.busy, lift: 0, heat: 0, currents: 0, cool: 0, skinCool: 0, share: 0, ...over };
    const lamp = lampOf(params, false);
    const sp = 0.9 * lamp.spacing, W = params.width;
    shape.forEach(([a, b, c], i) => {
      lamp.x[i] = W / 2 + a * sp;
      lamp.y[i] = 0.6 + b * sp;
      lamp.z[i] = W / 2 + c * sp;
      lamp.body[i] = 1;
    });
    lamp.bodies = 2;
    for (let k = 0; k < 150; k++) step(lamp);
    return lamp;
  };
  const ball = (cx: number, r: number) => {
    const points: [number, number, number][] = [];
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) if (a * a + b * b + c * c <= r * r) points.push([cx + a, b, c]);
    return points;
  };
  const labelOf = (lamp: ReturnType<typeof lampOf>, from: number, to: number) => {
    const counts = new Map<number, number>();
    for (let i = from; i < to; i++) counts.set(lamp.body[i], (counts.get(lamp.body[i]) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  };

  it("parts two blobs joined by a thread, within a couple of seconds", () => {
    const left = ball(-7, 4), right = ball(7, 4);
    const thread: [number, number, number][] = [-2, -1, 0, 1, 2].map((a) => [a, 0, 0]);
    const lamp = still([...left, ...thread, ...right]);
    const l = labelOf(lamp, 0, left.length);
    const r = labelOf(lamp, left.length + thread.length, left.length + thread.length + right.length);
    expect(l).not.toBe(r);
  });

  it("leaves a blob with no neck whole", () => {
    const one = ball(0, 5);
    const lamp = still(one);
    // One piece, but for a particle or two pushed off as the packing relaxes.
    const counts = new Map<number, number>();
    for (let i = 0; i < one.length; i++) counts.set(lamp.body[i], (counts.get(lamp.body[i]) ?? 0) + 1);
    expect([...counts.values()].filter((c) => c >= 4)).toHaveLength(1);
    expect(lamp.necks.size).toBe(lamp.necks.has(0) ? 1 : 0);
  });

  it("never parts necks when pinch is 0", () => {
    const left = ball(-7, 4), right = ball(7, 4);
    const thread: [number, number, number][] = [-2, -1, 0, 1, 2].map((a) => [a, 0, 0]);
    const lamp = still([...left, ...thread, ...right], { pinch: 0 });
    expect(labelOf(lamp, 0, left.length)).toBe(labelOf(lamp, left.length + thread.length, left.length + thread.length + right.length));
  });
});

describe("surface tension", () => {
  it("never flings apart two particles of a blob nearly alone", () => {
    // Two strays still labelled as one blob (labels are kept between relabellings, and a thread's
    // small pieces keep their blob's), all but a reach apart with nothing else round them: Akinci's
    // correction divides by the density between them, next to none. Once, in a hot box, one flew off
    // at twelve heights a second, and the rest followed.
    const params = { ...MOODS.busy, lift: 0, heat: 0, currents: 0, cool: 0, skinCool: 0, share: 0, pinch: 0 };
    const lamp = withRoom(lampOf(params, false), 2);
    const W = params.width, gap = 0.995 * lamp.reach;
    lamp.x.set([W / 2 - gap / 2, W / 2 + gap / 2]);
    lamp.y.set([0.6, 0.6]);
    lamp.z.set([W / 2, W / 2]);
    lamp.body.set([1, 1]);
    lamp.bodies = 2;
    // A step between relabellings.
    lamp.steps = 1;
    step(lamp);
    for (let i = 0; i < 2; i++) expect(Math.hypot(lamp.vx[i], lamp.vy[i], lamp.vz[i])).toBeLessThan(0.05);
  });
});

describe("a tank the box's shape", () => {
  it("is a deep tank as wide as the box, coarser than the lamp, a coil every so often clear of the walls", () => {
    const lamp = tankOf("busy", "lamp");
    expect(lamp).toBe(MOODS.busy);
    const wide = tankOf("busy", 16 / 9);
    expect(wide.width).toBeCloseTo(16 / 9, 6);
    expect(wide.depth).toBe(DEEP);
    expect(wide.wet).toBe(1);
    // About ten thousand particles, so a little further apart than the lamp's, the coils scaled with them.
    expect(wide.count).toBe(10000);
    const scale = spacingOf(wide) / spacingOf(MOODS.busy);
    expect(scale).toBeGreaterThan(1.2);
    expect(wide.coil).toBeCloseTo(MOODS.busy.coil * scale, 6);
    // Hotter, its pool spread across a wide floor.
    expect(wide.heat).toBeGreaterThan(MOODS.busy.heat);
    expect(tankOf("calm", 16 / 9).heat).toBeLessThan(wide.heat);
    // A narrower box keeps the widest's spacing, with fewer particles.
    expect(spacingOf(tankOf("busy", 1))).toBeCloseTo(spacingOf(wide), 4);
    expect(wide.coils.length).toBeGreaterThanOrEqual(2);
    for (const c of wide.coils) {
      expect(c).toBeGreaterThanOrEqual(wide.coil);
      expect(c).toBeLessThanOrEqual(wide.width - wide.coil);
    }
    // Laid out round the middle: as far from one wall as the other.
    expect(wide.coils[0]).toBeCloseTo(wide.width - wide.coils[wide.coils.length - 1], 6);
    // Too narrow for any of the widest's: one in the middle.
    expect(coilsOf(0.5, 0.08)).toEqual([0.25]);
    // Never wider than the widest.
    expect(tankOf("calm", 9).width).toBe(WIDEST);
  });

  it("runs, every particle inside the tank", () => {
    const p = tankOf("busy", 0.6);
    const lamp = lampOf(p);
    for (let k = 0; k < 60; k++) step(lamp);
    for (let i = 0; i < lamp.n; i++) {
      expect(lamp.x[i]).toBeLessThanOrEqual(p.width);
      expect(lamp.z[i]).toBeLessThanOrEqual(p.depth);
      expect(Number.isFinite(lamp.vy[i])).toBe(true);
    }
  }, 60_000);

  it("keeps a particle moving past the floor or a side finite", () => {
    // Moved past the floor before the walls hold it, as a fast one is, it's still read against the floor.
    const params = { ...tankOf("busy", 0.6), lift: 0, heat: 0, currents: 0 };
    const lamp = withRoom(lampOf(params, false), 3);
    const sp = lamp.spacing;
    lamp.x.set([0.3, 0.3 + sp, 0.6 * sp]);
    lamp.y.set([0.6 * sp, 0.6 * sp, 0.3]);
    lamp.z.set([0.15, 0.15, 0.15]);
    lamp.vy.set([-3, -3, 0]);
    lamp.vx.set([0, 0, -3]);
    lamp.steps = 1;
    step(lamp);
    for (let i = 0; i < 3; i++) {
      expect(Number.isFinite(lamp.x[i]) && Number.isFinite(lamp.y[i])).toBe(true);
      expect(lamp.y[i]).toBeGreaterThan(0);
      expect(lamp.x[i]).toBeGreaterThan(0);
    }
  });

  it("weighs the cool wax lying on the floor, not a blob in the liquid", () => {
    const params = tankOf("busy", 0.6);
    expect(params.settle).toBeGreaterThan(1);
    expect(MOODS.busy.settle).toBe(1);
    const lamp = lampOf(params, false);
    // A blob of the pool's particles lifted into the liquid, labelled apart.
    const up = Array.from({ length: 30 }, (_, k) => k);
    for (const i of up) {
      lamp.y[i] = 0.6 + (i % 3) * lamp.spacing;
      lamp.body[i] = 1;
    }
    lamp.bodies = 2;
    relabel(lamp, 0.1);
    expect(lamp.floored[0]).toBe(0);
    expect(lamp.floored[lamp.n - 1]).toBe(1);
  });

  it("has a floor the pool lies on as on more wax, so its bottom is no skin", () => {
    // How full the bottom layer is, beside a layer inside the pool: on a floor it lies on as on wax,
    // as full; on one it beads on, a skin.
    const layers = (wet: number) => {
      const lamp = lampOf({ ...tankOf("busy", 0.4), wet }, false);
      step(lamp);
      const sums = [0, 0], counts = [0, 0];
      for (let i = 0; i < lamp.n; i++) {
        const layer = lamp.y[i] < lamp.spacing ? 0 : lamp.y[i] > 3 * lamp.spacing && lamp.y[i] < 4 * lamp.spacing ? 1 : -1;
        if (layer < 0) continue;
        sums[layer] += lamp.full[i];
        counts[layer]++;
      }
      return { bottom: sums[0] / counts[0], inside: sums[1] / counts[1] };
    };
    const wet = layers(1), dry = layers(0);
    expect(wet.bottom).toBeGreaterThan(wet.inside - 0.03);
    expect(dry.bottom).toBeLessThan(dry.inside - 0.15);
  });
});
