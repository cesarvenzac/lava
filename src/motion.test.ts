import { describe, expect, it } from "vitest";

import { countFor, type Frame, frameOf, type Layout, place, sinceCrossing } from "./motion.ts";
import { MOST, planOf } from "./plan.ts";

const WIDE = 16 / 9;
const layoutOf = (over: Partial<Layout> = {}): Layout => {
  const aspect = over.aspect ?? WIDE;
  return { aspect, pool: 0.12, size: 1, count: countFor(aspect), pixel: 1 / 540, ...over };
};
const KEYS = ["blobs", "tails", "shapes", "necks", "roots", "mounds"] as const;
const snapshot = (frame: Frame) => Object.fromEntries(KEYS.map((key) => [key, frame[key].slice(0, frame.count * 4)])) as Record<(typeof KEYS)[number], Float32Array>;

/** The most each of the frame's numbers changes from one frame to the next, at `fps`, over `seconds`. */
function largestSteps(seed: string, layout: Layout, seconds: number, fps: number, from = 30) {
  const plan = planOf(seed);
  const frame = frameOf();
  let before = snapshot(place(plan, from, layout, frame));
  const most = Object.fromEntries(KEYS.map((key) => [key, 0])) as Record<(typeof KEYS)[number], number>;
  for (let k = 1; k <= seconds * fps; k++) {
    const now = snapshot(place(plan, from + k / fps, layout, frame));
    for (const key of KEYS)
      for (let i = 0; i < now[key].length; i++) {
        // A neck's ends only matter while it's drawn: its radii always do, so one can't appear at once.
        const piece = (key === "necks" || key === "roots") && i % 4 < 2;
        if (piece && (now[key][i - (i % 4) + 2] === 0 || before[key][i - (i % 4) + 2] === 0)) continue;
        most[key] = Math.max(most[key], Math.abs(now[key][i] - before[key][i]));
      }
    before = now;
  }
  return most;
}

describe("place", () => {
  it("draws the same moment the same way", () => {
    const a = place(planOf("lava"), 42.5, layoutOf());
    const b = place(planOf("lava"), 42.5, layoutOf());
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.poolReach).toBe(b.poolReach);
  });

  it("moves nothing far from one frame to the next, partings included", () => {
    for (const [seed, layout] of [
      ["lava", layoutOf()],
      ["ember", layoutOf({ aspect: 9 / 16, count: countFor(9 / 16) })],
      ["tide", layoutOf({ aspect: 1, pool: 0.25, size: 1.4, count: countFor(1) })],
      ["drift", layoutOf({ pool: 0 })],
    ] as const) {
      const most = largestSteps(seed, layout, 120, 60);
      // A blob drifts; a neck's halves draw back quicker, but never jump.
      expect(most.blobs, `${seed}: blobs`).toBeLessThan(0.006);
      expect(most.tails, `${seed}: lobes`).toBeLessThan(0.008);
      expect(most.shapes, `${seed}: stretch`).toBeLessThan(0.02);
      expect(most.necks, `${seed}: necks`).toBeLessThan(0.02);
      expect(most.roots, `${seed}: roots`).toBeLessThan(0.02);
      expect(most.mounds, `${seed}: mounds`).toBeLessThan(0.006);
    }
  });

  it("never pops as a neck parts: its halves carry on from the shape it had", () => {
    const plan = planOf("lava");
    const layout = layoutOf();
    const frame = frameOf();
    // Find partings, then step through each at 600 frames a second.
    let checked = 0;
    for (let t = 30; t < 150 && checked < 5; t += 1 / 30) {
      place(plan, t, layout, frame);
      frame.parted.forEach((since, i) => {
        if (since === null || since > 1 / 30) return;
        const at = t - since;
        let before = snapshot(place(plan, at - 0.05, layout, frameOf()));
        for (let k = 1; k <= 60; k++) {
          const now = snapshot(place(plan, at - 0.05 + k / 600, layout, frameOf()));
          for (const key of ["necks", "roots", "shapes"] as const)
            for (let c = 0; c < 4; c++) expect(Math.abs(now[key][i * 4 + c] - before[key][i * 4 + c]), `${key} of blob ${i} at ${at.toFixed(3)}`).toBeLessThan(0.004);
          before = now;
        }
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("parts every blob's neck once a climb while there's a pool", () => {
    const plan = planOf("lava");
    const layout = layoutOf();
    const frame = frameOf();
    const parted = new Set<number>();
    for (let t = 0; t < 100; t += 1 / 20) {
      place(plan, t, layout, frame);
      frame.parted.forEach((since, i) => {
        if (since !== null) parted.add(i);
      });
    }
    // Every blob's cycle is under 45 seconds, so in 100 each has parted at least once.
    expect(parted.size).toBe(layout.count);
  });

  it("keeps every shape inside its bounds, and the pool's reach above its mounds and roots", () => {
    for (const [seed, layout] of [
      ["lava", layoutOf()],
      ["comet", layoutOf({ aspect: 0.6, count: countFor(0.6), size: 1.5 })],
    ] as const) {
      const plan = planOf(seed);
      const frame = frameOf();
      for (let t = 0; t < 90; t += 0.1) {
        place(plan, t, layout, frame);
        for (let i = 0; i < frame.count; i++) {
          const [x, y, , r] = frame.blobs.subarray(i * 4, i * 4 + 4);
          const [bx, by, reach] = frame.bounds.subarray(i * 4, i * 4 + 3);
          const stretch = frame.shapes[i * 4];
          const far = (px: number, py: number, radius: number) => Math.hypot(px - bx, py - by) + radius;
          expect(far(x, y, r * Math.max(stretch, 1 / Math.sqrt(stretch)))).toBeLessThanOrEqual(reach);
          const [tx, ty, , tr] = frame.tails.subarray(i * 4, i * 4 + 4);
          expect(far(tx, ty, tr)).toBeLessThanOrEqual(reach);
          const [top, tip, topR, tipR] = frame.necks.subarray(i * 4, i * 4 + 4);
          if (topR > 0) expect(Math.max(far(x, top, topR), far(x, tip, tipR))).toBeLessThanOrEqual(reach);
          const [foot, rootTip, footR, rootTipR] = frame.roots.subarray(i * 4, i * 4 + 4);
          if (footR > 0) {
            expect(Math.max(far(x, foot, footR), far(x, rootTip, rootTipR))).toBeLessThanOrEqual(reach);
            expect(rootTip + rootTipR).toBeLessThan(frame.poolReach);
          }
          const surface = -0.5 + layout.pool * Math.min(1, layout.aspect);
          expect(surface + frame.mounds[i * 4 + 2]).toBeLessThan(frame.poolReach);
        }
      }
    }
  });

  it("draws no neck, root or mound without a pool", () => {
    const frame = place(planOf("lava"), 47, layoutOf({ pool: 0 }));
    for (let i = 0; i < frame.count; i++) {
      expect(frame.necks[i * 4 + 2]).toBe(0);
      expect(frame.roots[i * 4 + 2]).toBe(0);
      expect(frame.mounds[i * 4 + 2]).toBe(0);
      expect(frame.parted[i]).toBeNull();
    }
  });

  it("sizes blobs to the box's shorter side", () => {
    const wide = place(planOf("lava"), 40, layoutOf({ count: 6 }));
    const tall = place(planOf("lava"), 40, layoutOf({ aspect: 0.5, count: 6 }));
    for (let i = 0; i < 6; i++) expect(tall.blobs[i * 4 + 3]).toBeCloseTo(wide.blobs[i * 4 + 3] * 0.5, 5);
  });
});

describe("countFor", () => {
  it("holds more blobs in a long box, either way, and as many as asked within reason", () => {
    expect(countFor(1)).toBe(6);
    expect(countFor(16 / 9)).toBe(8);
    expect(countFor(9 / 16)).toBe(8);
    expect(countFor(4)).toBe(MOST);
    expect(countFor(16 / 9, 3)).toBe(3);
    expect(countFor(1, 40)).toBe(MOST);
    expect(countFor(1, 0)).toBe(1);
  });
});

describe("sinceCrossing", () => {
  it("finds how long ago a path rose past a height, within four seconds", () => {
    const rising = (t: number) => t - 10;
    expect(sinceCrossing(rising, 0, 12)).toBeCloseTo(2, 3);
    expect(sinceCrossing(rising, 0, 15)).toBeNull();
    expect(sinceCrossing((t) => 10 - t, 0, 12)).toBeNull();
  });
});
