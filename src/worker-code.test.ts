import { describe, expect, it } from "vitest";

import { moduleOf, workerSource } from "../scripts/worker.mjs";
import { WORKER } from "./worker-code.ts";

describe("the bundled worker", () => {
  it("is the worker as its sources stand: run npm run worker if not", async () => {
    const source: string = await workerSource();
    expect(WORKER).toBe(source);
    expect(moduleOf(source)).toContain("export const WORKER");
  }, 30_000);
});
