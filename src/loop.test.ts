import { describe, expect, it } from "vitest";

import { BLOB_COLOURS, particlesOf } from "./loop.ts";
import { lampOf, MOODS } from "./sim.ts";

describe("the particles, as they're sent to be drawn", () => {
  it("carry each one's place, its blob's colour (the pool's first) and its warmth", () => {
    const lamp = lampOf({ ...MOODS.busy, count: 600 }, false);
    // Two blobs: most of the pool, and a few particles labelled apart.
    lamp.body.fill(0);
    for (let i = 0; i < 20; i++) lamp.body[i] = 7;
    lamp.t[0] = 70;
    lamp.t[1] = 20;
    const { positions, colour, warmth } = particlesOf(lamp);
    expect(positions.length).toBe(3 * lamp.n);
    expect([positions[3], positions[4], positions[5]]).toEqual([lamp.x[1], lamp.y[1], lamp.z[1]]);
    expect(colour[lamp.n - 1]).toBe(0);
    expect(colour[0]).toBe(1 + (7 % (BLOB_COLOURS - 1)));
    expect(warmth[0]).toBe(255);
    expect(warmth[1]).toBe(0);
  });
});
