/**
 * A lamp's plan, from its seed: for each blob, its size, its column across the box, how high and
 * how slowly it climbs, and how it sways and drifts in depth. Sizes are shares of the box's
 * shorter side, so any box gets blobs in proportion.
 */

import { generator, hashOf } from "./random.ts";

/** The most blobs a lamp holds. */
export const MOST = 12;

const TAU = Math.PI * 2;

export type BlobPlan = {
  /** Where in its column it sits, 0 to 1. */
  slot: number;
  /** Its radius, as a share of the box's shorter side. */
  radius: number;
  /** Seconds for one climb and fall. */
  period: number;
  /** Where in that cycle it starts, 0 to 1. */
  phase: number;
  /** How high it climbs, as a share of the box. */
  reach: number;
  /** How much its rhythm is bent, so none keeps time with another. */
  warp: number;
  warpRate: number;
  warpPhase: number;
  /** Its sideways sway, two waves. */
  swayA: number;
  swayB: number;
  swayRate: number;
  swayPhase: number;
  /** How deep it sits, and how it drifts nearer and further. */
  z: number;
  zA: number;
  zRate: number;
  zPhase: number;
  /** How it swells a little and back. */
  breathe: number;
  breathePhase: number;
  /** Which way its trailing lobe leans. */
  lean: number;
};

export type Plan = {
  blobs: BlobPlan[];
  /** The order the blobs take their columns in, so neighbours aren't neighbours in the plan. */
  order: number[];
};

export function planOf(seed: string | number): Plan {
  const random = generator(hashOf(seed));
  const order = Array.from({ length: MOST }, (_, i) => i);
  for (let i = MOST - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const blobs = Array.from({ length: MOST }, (): BlobPlan => {
    const u = random();
    return {
      slot: random(),
      // Few big, many small.
      radius: 0.055 + 0.11 * Math.pow(u, 1.4),
      period: 22 + random() * 22,
      phase: random(),
      reach: 0.55 + random() * 0.6,
      warp: 0.02 + random() * 0.04,
      warpRate: 0.07 + random() * 0.08,
      warpPhase: random() * TAU,
      swayA: 0.02 + random() * 0.035,
      swayB: 0.006 + random() * 0.012,
      swayRate: 0.04 + random() * 0.05,
      swayPhase: random() * TAU,
      z: -0.3 + random() * 0.48,
      zA: 0.03 + random() * 0.05,
      zRate: 0.03 + random() * 0.04,
      zPhase: random() * TAU,
      breathe: 0.15 + random() * 0.2,
      breathePhase: random() * TAU,
      lean: (random() - 0.5) * 0.8,
    };
  });
  return { blobs, order };
}
