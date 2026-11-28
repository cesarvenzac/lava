import { describe, expect, it } from "vitest";

import { BOX, LAMP_STAGE } from "./gl.ts";
import { stageOf, viewOf } from "./lava.ts";
import { MOODS, tankOf } from "./sim.ts";

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

describe("what a box shows of a tank its own shape", () => {
  it("is all of it", () => {
    const tank = [16 / 9, 1, 0.3] as const;
    const view = viewOf(16 / 9, 0.5, tank);
    expect(view.x).toBe(0);
    expect(view.y).toBeCloseTo(0);
    expect(view.width).toBeCloseTo(16 / 9);
    expect(view.height).toBeCloseTo(1);
  });
});

describe("how a tank is drawn", () => {
  it("is the lamp as it always was, through a long lens", () => {
    expect(stageOf(MOODS.busy, true)).toBe(LAMP_STAGE);
    expect(LAMP_STAGE.eye).toBe(0);
    expect(LAMP_STAGE.coils).toEqual(MOODS.busy.coils);
  });

  it("is a box's from in front, its depth its own, its coils' light where they are", () => {
    const p = tankOf("busy", 16 / 9);
    const stage = stageOf(p, false);
    expect(stage.size).toEqual([p.width, 1, p.depth]);
    expect(stage.eye).toBeGreaterThan(0);
    expect(stage.deep).toBe(p.depth);
    expect(stage.coils).toEqual(p.coils);
    // Its wax shaded at the scale of its blobs, larger than the lamp's.
    expect(stage.unit).toBeGreaterThan(0.4);
  });
});
