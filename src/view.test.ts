import { describe, expect, it } from "vitest";

import { BOX } from "./gl.ts";
import { viewOf } from "./lava.ts";

describe("what a box shows of the lamp", () => {
  it("is all of it in a box the lamp's shape", () => {
    expect(viewOf(0.4, 0.5)).toEqual({ x: 0, y: 0, width: 0.4, height: 1 });
  });

  it("is a band in a wider box, `place` choosing which", () => {
    const view = viewOf(2, 0.5);
    expect(view.width).toBe(BOX[0]);
    expect(view.height).toBeCloseTo(0.2);
    expect(view.y).toBeCloseTo(0.4);
    expect(viewOf(2, 0).y).toBe(0);
    expect(viewOf(2, 1).y + viewOf(2, 1).height).toBeCloseTo(1);
  });

  it("is the middle of its width in a narrower box", () => {
    const view = viewOf(0.2, 0.5);
    expect(view.height).toBe(1);
    expect(view.x).toBeCloseTo(0.1);
    expect(view.width).toBeCloseTo(0.2);
  });
});
