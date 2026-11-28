import { describe, expect, it } from "vitest";

import { blur, dimsOf, FIELD, fieldOf, sectionDimsOf } from "./field.ts";
import { lampOf, MOODS, tankOf } from "./sim.ts";

describe("the field", () => {
  const lamp = lampOf(MOODS.busy);
  const field = fieldOf(lamp);
  const [gx, gy, gz] = FIELD;
  const at = (i: number, j: number, k: number) => i + gx * (j + gy * k);

  it("is full deep in the pool and empty above it", () => {
    expect(field.wax.length).toBe(gx * gy * gz);
    expect(field.wax[at(20, 5, 20)]).toBe(255);
    expect(field.wax[at(20, 60, 20)]).toBe(0);
  });

  it("gives the pool's warmth, and the liquid's where there's no wax", () => {
    // 47.5 degrees, 20 to 70 as 0 to 255.
    expect(field.heat[at(20, 5, 20)]).toBeCloseTo(((47.5 - 20) / 50) * 255, -1);
    expect(field.heat[at(20, 99, 20)]).toBeCloseTo(((38.2 - 20) / 50) * 255, -1);
  });

  it("creases where two blobs press, rather than running them together", () => {
    const one = lampOf(MOODS.busy, false), two = lampOf(MOODS.busy, false);
    for (const lamp2 of [one, two]) {
      const sp = lamp2.spacing;
      let k = 0;
      for (let i = 0; i < 2; i++) {
        lamp2.x[k] = 0.2 + (i ? 1 : -1) * sp * 1.2;
        lamp2.y[k] = 0.5;
        lamp2.z[k] = 0.2;
        k++;
      }
      (lamp2 as { n: number }).n = 2;
    }
    two.body[1] = 1;
    const middle = at(19, 49, 19);
    expect(fieldOf(two).wax[middle]).toBeLessThan(fieldOf(one).wax[middle]);
  });
});

describe("blur", () => {
  it("keeps a flat field flat and spreads a point evenly", () => {
    const dims: [number, number, number] = [9, 9, 9];
    const flat = new Float32Array(729).fill(2);
    blur(flat, dims, 2);
    expect(flat[4 + 9 * (4 + 9 * 4)]).toBeCloseTo(2, 5);
    const point = new Float32Array(729);
    point[4 + 9 * (4 + 9 * 4)] = 125;
    blur(point, dims, 2);
    expect(point[4 + 9 * (4 + 9 * 4)]).toBeCloseTo(1, 5);
    expect(point[6 + 9 * (6 + 9 * 6)]).toBeCloseTo(1, 5);
  });
});

describe("a section", () => {
  it("is the field on one layer across the middle of the depth, on cells as coarse as the tank's wax", () => {
    const p = tankOf("busy", 16 / 9);
    const lamp = lampOf(p, false);
    const dims = sectionDimsOf(p);
    expect(dims).toEqual([128, 72, 1]);
    const { wax } = fieldOf(lamp, dims);
    expect(wax.length).toBe(128 * 72);
    // The pool fills the floor's cells and none at the top.
    expect(wax[64 + 128 * 3]).toBeGreaterThan(200);
    expect(wax[64 + 128 * 65]).toBe(0);
    expect(dimsOf(p)).toEqual([128, 72, 22]);
    expect(dimsOf(MOODS.busy)).toEqual(FIELD);
  });
});
