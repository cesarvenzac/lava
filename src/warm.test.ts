import { describe, expect, it } from "vitest";

import { lampOf, MOODS, type Mood, step } from "./sim.ts";
import { pack, unpackLamp, unzip } from "./warm.ts";
import { WARM } from "./warm-data.ts";

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
  });

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
