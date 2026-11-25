import { describe, expect, it } from "vitest";

import { MOST, planOf } from "./plan.ts";
import { generator, hashOf } from "./random.ts";

describe("planOf", () => {
  it("lays out the same lamp for the same seed, and another for another", () => {
    expect(planOf("lava")).toEqual(planOf("lava"));
    expect(planOf(7)).toEqual(planOf("7"));
    expect(planOf("lava")).not.toEqual(planOf("ember"));
  });

  it("gives every blob a column of its own and a size in range, few big and many small", () => {
    const { blobs, order } = planOf("lava");
    expect(blobs).toHaveLength(MOST);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: MOST }, (_, i) => i));
    const radii = blobs.map((blob) => blob.radius);
    for (const radius of radii) {
      expect(radius).toBeGreaterThanOrEqual(0.055);
      expect(radius).toBeLessThanOrEqual(0.165);
    }
    let small = 0;
    for (let s = 0; s < 40; s++) small += planOf(s).blobs.filter((blob) => blob.radius < 0.11).length;
    expect(small / (40 * MOST)).toBeGreaterThan(0.55);
  });
});

describe("randomness", () => {
  it("is the same for the same seed, spread over [0, 1)", () => {
    expect(hashOf("lava")).toBe(hashOf("lava"));
    expect(hashOf("lava")).not.toBe(hashOf("Lava"));
    const a = generator(hashOf("x"));
    const b = generator(hashOf("x"));
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 2000).toBeCloseTo(0.5, 1);
  });
});
