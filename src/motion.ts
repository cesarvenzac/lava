/**
 * Where every blob is at a moment, and what shape it's in, for wax as thick as a lamp's: nothing
 * bounces or rings.
 *
 * Each blob climbs out of the pool and sinks back on a slow cycle, its rhythm bent a little so none
 * keeps time with another. Rising, it draws a thick neck out of the pool, which heaves up into a
 * broad mound under it. The neck is two tapering halves meeting at a waist, the upper flaring into
 * the blob and the lower into the pool; the waist thins as the blob rises and parts while still
 * thick. Then the upper half is drawn up into the blob and the lower slumps into the pool, while
 * the blob eases from stretched to round with no overshoot. Sinking, a blob flattens as it presses
 * in, and the pool bulges round it.
 *
 * All of it is worked out from the time alone: the moment a neck parts is found on its blob's own
 * path, and everything after it follows from the time since. So any moment can be drawn on its
 * own, the same on every screen, and nothing jumps from one frame to the next.
 *
 * Units: the box is 1 tall, its middle at 0, so it runs from -0.5 to 0.5 up and by its aspect
 * across; depth is toward the viewer.
 */

import { MOST, type Plan } from "./plan.ts";

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export type Layout = {
  /** The box's width over its height. */
  aspect: number;
  /** How deep the pool on the bulb is, as a share of the box's shorter side; 0 for none. */
  pool: number;
  /** How big the blobs are, against the plan's own. */
  size: number;
  /** How many blobs to draw. */
  count: number;
  /** One pixel of the drawing, as a share of the box's height: bounds keep a few in hand. */
  pixel: number;
};

/** What the shader is told about a moment: four numbers a blob, ready to send as they are. */
export type Frame = {
  count: number;
  /** Each blob's centre and radius. */
  blobs: Float32Array;
  /** The lobe trailing it, which makes it a teardrop rising and a pear sinking: centre, radius. */
  tails: Float32Array;
  /** What it can cover on screen: centre, radius, and half its depth. */
  bounds: Float32Array;
  /** How far it's stretched up and down (its volume kept), then three unused. */
  shapes: Float32Array;
  /** The upper half of its neck: its top, its tip, and the radius at each (0 for none). */
  necks: Float32Array;
  /** The lower half, in the pool: its foot, its tip, and the radius at each (0 for none). */
  roots: Float32Array;
  /** Where the pool heaves or bulges under it: x, depth, height, width. */
  mounds: Float32Array;
  /** The highest the pool, its mounds and its necks reach, with the blend above them. */
  poolReach: number;
  /** For each blob, seconds since its neck parted, while that still shapes it; else null. */
  parted: (number | null)[];
};

/** A frame to fill, made once and filled each moment. */
export function frameOf(): Frame {
  const four = () => new Float32Array(MOST * 4);
  return { count: 0, blobs: four(), tails: four(), bounds: four(), shapes: four(), necks: four(), roots: four(), mounds: four(), poolReach: -0.5, parted: [] };
}

/** How many blobs a box holds, unless told: more for a long box either way. */
export function countFor(aspect: number, count?: number | null): number {
  if (count != null) return clamp(Math.round(count), 1, MOST);
  return clamp(Math.round(3 + 2.6 * Math.max(aspect, 1 / aspect)), 3, MOST);
}

/** Seconds since a path last crossed a height going up, if within the last four; else null. */
export function sinceCrossing(heightAt: (time: number) => number, level: number, now: number): number | null {
  const step = 0.05;
  let after = heightAt(now) - level;
  for (let k = 1; k <= 80; k++) {
    const before = heightAt(now - k * step) - level;
    if (before < 0 && after >= 0) {
      let a = now - k * step;
      let b = a + step;
      for (let j = 0; j < 16; j++) {
        const m = (a + b) / 2;
        if (heightAt(m) - level < 0) a = m;
        else b = m;
      }
      return now - (a + b) / 2;
    }
    after = before;
  }
  return null;
}

/** Where everything is at `time`, in seconds, written into `into` (a new frame if not given). */
export function place(plan: Plan, time: number, layout: Layout, into: Frame = frameOf()): Frame {
  const { aspect, size, pixel } = layout;
  const unit = Math.min(1, aspect);
  const n = clamp(layout.count, 0, MOST);
  const pooled = layout.pool > 0;
  const surface = -0.5 + layout.pool * unit;
  let highest = surface + 0.02 * unit;
  const ranks = plan.order.filter((k) => k < n);
  into.count = n;
  into.parted.length = 0;
  for (let i = 0; i < n; i++) {
    const b = plan.blobs[i];
    const r0 = b.radius * unit * size;
    // The neck parts early in the climb, while its waist is still thick.
    const partAt = surface + 1.7 * r0;
    // Every blob climbs high enough for its neck to part.
    const climb = Math.max(b.reach * (1.05 + 2 * r0), pooled ? partAt + 0.08 * unit + 0.5 + 1.5 * r0 : 0);
    const heightAt = (t: number) => {
      const u = t / b.period + b.phase + b.warp * Math.sin(t * b.warpRate + b.warpPhase);
      const e = 0.5 - 0.5 * Math.cos(u * TAU);
      return -0.5 - r0 * 0.5 + e * climb;
    };
    const bottomAt = (t: number) => heightAt(t) - r0;
    const y = heightAt(time);
    const rise = (heightAt(time + 0.05) - heightAt(time - 0.05)) / 0.1;
    const pull = clamp(rise / (0.06 * unit), -1, 1);
    const bottom = y - r0;
    const held = pooled && rise > 0 && bottom < partAt ? smooth(surface - r0, partAt, bottom) : 0;
    const crossed = pooled ? sinceCrossing(bottomAt, partAt, time) : null;
    const freed = crossed !== null && held === 0 && crossed < 3 ? crossed : null;
    const pressed = pooled ? smooth(surface + 0.35 * r0, surface - 0.8 * r0, bottom) : 0;
    into.parted.push(freed);

    let stretch = 1 + 0.26 * pull * pull + 0.28 * held - 0.2 * pressed;
    if (freed !== null) stretch += 0.28 * Math.exp(-freed / 0.6);
    stretch = Math.max(stretch, 0.7);
    const rank = ranks.indexOf(i);
    const slot = n > 1 ? ((rank + 0.5 + (b.slot - 0.5) * 0.6) / n - 0.5) * aspect * 0.94 : 0;
    const x = slot + unit * (b.swayA * Math.sin(time * b.swayRate + b.swayPhase) + b.swayB * Math.sin(time * b.swayRate * 2.3 + b.swayPhase * 1.7));
    const z = unit * (b.z + b.zA * Math.sin(time * b.zRate + b.zPhase));
    const r = r0 * (1 + 0.03 * Math.sin(time * b.breathe + b.breathePhase));
    into.blobs.set([x, y, z, r], i * 4);
    into.shapes.set([stretch, 0, 0, 0], i * 4);

    // The lobe trails the way the blob moves: a teardrop rising, a pear sinking.
    const lobe = r * (0.56 + 0.1 * Math.abs(pull));
    const lobeX = x + b.lean * r * 0.3 * Math.abs(pull);
    const lobeY = y - pull * r * 0.62 * stretch;
    into.tails.set([lobeX, lobeY, z, lobe], i * 4);

    // The neck. The lower half rises from deep in the pool, so only a gentle skirt flares out of
    // its surface; each half keeps its taper through the parting, so nothing jumps.
    const neckTop = y - r * 0.35 * stretch;
    const foot = surface - 0.9 * r0;
    const waistAt = Math.max(surface + (Math.min(bottom, partAt) - surface) * 0.5, surface - 0.2 * r0);
    const parting = r0 * 0.26;
    let upTip = waistAt, upR = 0, upTipR = 0, lowTip = waistAt, lowR = 0, lowTipR = 0;
    if (held > 0) {
      const grow = smooth(0, 0.2, held);
      const waist = r0 * (0.62 - 0.36 * Math.pow(held, 1.3));
      upR = r0 * 0.7 * grow;
      upTipR = waist * grow;
      lowR = r0 * 0.95 * grow;
      lowTipR = waist * grow;
    } else if (freed !== null) {
      const up = 1 - Math.exp(-freed / 0.45);
      const down = 1 - Math.exp(-freed / 0.4);
      const fade = 1 - smooth(1.6, 2.8, freed);
      upTip = waistAt + (neckTop - waistAt) * up;
      upR = r0 * 0.7 * (1 - 0.4 * up) * fade;
      upTipR = parting * (1 - 0.4 * up) * fade;
      // The lower half sinks back into the pool, spreading a little: it never swells.
      lowTip = waistAt + (surface - 0.6 * r0 - waistAt) * down;
      lowR = r0 * 0.95 * fade;
      lowTipR = parting * (1 + 0.3 * down) * fade;
    }
    into.necks.set([neckTop, upTip, upR, upTipR], i * 4);
    into.roots.set([foot, lowTip, lowR, lowTipR], i * 4);

    // Under a blob it's letting go of, the pool heaves up into a broad mound; round one pressing
    // in, it bulges.
    const heave = pooled ? 0.42 * r0 * Math.sin(Math.PI * held) + 0.16 * r0 * pressed * (1 - held) : 0;
    into.mounds.set([x, z, heave, r0 * (1.5 + 0.6 * pressed)], i * 4);
    // The pool is looked at up to where the halves meet, so the two are blended there.
    highest = Math.max(
      highest,
      surface + heave + 0.02 * unit,
      lowR > 0 ? Math.max(lowTip + lowTipR, foot + lowR) : -1,
      upR > 0 ? Math.min(upTip, waistAt) + upTipR + 0.02 * unit : -1,
    );

    const toLobe = Math.hypot(lobeX - x, lobeY - y) + lobe;
    const toNeck = upR > 0 ? Math.max(Math.abs(y - upTip), Math.abs(y - neckTop)) + Math.max(upR, upTipR) : 0;
    const toRoot = lowR > 0 ? Math.max(Math.abs(y - foot), Math.abs(y - lowTip)) + Math.max(lowR, lowTipR) : 0;
    const reachOut = Math.max(r * Math.max(stretch, 1) * 1.15, toLobe, toNeck, toRoot) + r * 0.6 + 0.012 * unit + 3 * pixel;
    into.bounds.set([x, y, reachOut, r * 1.45 + 0.012 * unit], i * 4);
  }
  // How high the pool's own surface can reach, with its sway and its blend above that.
  into.poolReach = highest + 0.014 * unit + 0.12 * unit;
  return into;
}
