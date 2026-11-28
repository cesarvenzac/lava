import { describe, expect, it } from "vitest";

import { lampOf, MOODS, type Mood, step, tankOf, WIDEST } from "./sim.ts";
import { cutLamp, pack, unpackLamp, unzip } from "./warm.ts";
import { WARM as BUSY } from "./warm/lamp-busy.ts";
import { WARM as CALM } from "./warm/lamp-calm.ts";

const WARM: Record<string, string> = { busy: BUSY, calm: CALM };

describe("warm starts", () => {
  it("keep a lamp's particles to within a hair", () => {
    const lamp = lampOf(MOODS.calm);
    for (let k = 0; k < 30; k++) step(lamp);
    lamp.body[3] = 7;
    const back = unpackLamp(MOODS.calm, pack(lamp));
    expect(back.n).toBe(lamp.n);
    expect(back.time).toBeCloseTo(lamp.time, 4);
    for (const i of [0, 3, 1000, lamp.n - 1]) {
      expect(back.x[i]).toBeCloseTo(lamp.x[i], 4);
      expect(back.y[i]).toBeCloseTo(lamp.y[i], 4);
      expect(back.t[i]).toBeCloseTo(lamp.t[i], 2);
    }
    // Labels made small, the same particles still apart.
    expect(back.body[3]).not.toBe(back.body[0]);
  }, 30_000);

  for (const mood of Object.keys(MOODS) as Mood[])
    it(`for ${mood} lamp is a running lamp`, async () => {
      const lamp = unpackLamp(MOODS[mood], await unzip(WARM[mood]));
      expect(lamp.time).toBeGreaterThan(100);
      // Some of the wax is up off the pool.
      let up = 0;
      for (let i = 0; i < lamp.n; i++) if (lamp.y[i] > 0.4) up++;
      expect(up / lamp.n).toBeGreaterThan(0.02);
      step(lamp);
      expect(Number.isFinite(lamp.y[0])).toBe(true);
    });
});

describe("a box's start, cut from the widest tank's", () => {
  it("keeps the particles within its width round the middle, moved over", async () => {
    const widest = tankOf("busy", WIDEST);
    const lamp = lampOf(widest, false);
    lamp.time = 120;
    const bytes = pack(lamp);
    const narrow = tankOf("busy", 1);
    const cut = cutLamp(narrow, bytes);
    const offset = (WIDEST - 1) / 2;
    const inside = Array.from(lamp.x).filter((x) => x >= offset && x <= offset + 1).length;
    expect(Math.abs(cut.n - inside)).toBeLessThanOrEqual(2);
    expect(cut.time).toBeCloseTo(120, 3);
    for (let i = 0; i < cut.n; i++) {
      expect(cut.x[i]).toBeGreaterThanOrEqual(0);
      expect(cut.x[i]).toBeLessThanOrEqual(1);
      expect(cut.z[i]).toBeLessThanOrEqual(narrow.depth);
    }
  });
});
