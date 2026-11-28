/**
 * The wax as a field on a grid, for the renderer: each particle splatted as a soft ball, each blob on
 * its own and the thickest kept where blobs overlap, so where two press together a crease shows rather
 * than one joined shape; how full each cell is, saturated a little short of the wax's mean so the
 * lattice the particles rest as never shows; and their warmth, smoothed over a few cells (neighbours
 * differ by degrees, and drawn raw a stem glowed speckled, the speckles streaming up as it fed). Both
 * as bytes, ready for 3D textures: the share filled 0 to 255, the warmth 20 to 70 degrees as 0 to 255.
 *
 * Pure: no DOM.
 */

import { type Lamp, liquidAt, MOODS, type Params, spacingOf } from "./sim.ts";

/** The field's grid over the lamp: cells a hundredth of its height. */
export const FIELD: [number, number, number] = [40, 100, 40];

/**
 * The field's grid over a tank of any shape: cells a hundredth of the lamp's height (`FIELD`), or in
 * a tank whose particles lie further apart, as much larger as they are, so each particle's ball spans
 * as many cells as in the lamp and the field costs as much a particle to make and to draw.
 */
export function dimsOf(p: Params): [number, number, number] {
  const cell = cellOf(p);
  return [Math.max(2, Math.round(p.width / cell)), Math.max(2, Math.round(1 / cell)), Math.max(2, Math.round(p.depth / cell))];
}

/**
 * A section's grid: one layer of cells across the middle of the tank's depth, so `fieldOf` on it is a
 * clean cut through the wax there (each particle within reach of the middle counted by its distance
 * to it, blobs apart, the warmth smoothed as it is in 3D).
 */
export function sectionDimsOf(p: Params): [number, number, number] {
  const [gx, gy] = dimsOf(p);
  return [gx, gy, 1];
}

const cellOf = (p: Params) => 0.01 * (spacingOf(p) / spacingOf(MOODS.busy));

export type Field = { wax: Uint8Array; heat: Uint8Array; dims: [number, number, number] };

type Work = { dens: Float32Array; hot: Float32Array; best: Float32Array; bestHot: Float32Array; seen: Uint8Array; touched: Int32Array; warm: Float32Array; weight: Float32Array; order: Int32Array; deep: number };
const works = new WeakMap<Lamp, Work>();

/** How far each particle's ball reaches, in spacings. */
const RADIUS = 2.2;

export function fieldOf(lamp: Lamp, dims: [number, number, number] = FIELD): Field {
  const [gx, gy, gz] = dims;
  const W = lamp.params.width, D = lamp.params.depth;
  const size = gx * gy * gz;
  const cell = [W / gx, 1 / gy, D / gz];
  const r = RADIUS * lamp.spacing;
  const rx = r / cell[0], ry = r / cell[1], rz = r / cell[2];
  let w = works.get(lamp);
  if (!w || w.dens.length !== size || w.order.length !== lamp.n) {
    w = {
      dens: new Float32Array(size),
      hot: new Float32Array(size),
      best: new Float32Array(size),
      bestHot: new Float32Array(size),
      seen: new Uint8Array(size),
      touched: new Int32Array(size),
      warm: new Float32Array(size),
      weight: new Float32Array(size),
      order: new Int32Array(lamp.n),
      deep: deepOf(lamp, cell, rx, ry, rz),
    };
    works.set(lamp, w);
  }
  const { dens, hot, best, bestHot, seen, touched, warm, weight, order } = w;
  best.fill(0);
  bestHot.fill(0);
  const { n, x, y, z, t, body } = lamp;
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((u, v) => body[u] - body[v]);
  let touchedCount = 0;
  const flush = () => {
    for (let c = 0; c < touchedCount; c++) {
      const at = touched[c];
      if (dens[at] > best[at]) {
        best[at] = dens[at];
        bestHot[at] = hot[at] / dens[at];
      }
      dens[at] = 0;
      hot[at] = 0;
      seen[at] = 0;
    }
    touchedCount = 0;
  };
  for (let o = 0; o < n; o++) {
    const i = order[o];
    if (o > 0 && body[i] !== body[order[o - 1]]) flush();
    const X = x[i] / cell[0] - 0.5, Y = y[i] / cell[1] - 0.5, Z = z[i] / cell[2] - 0.5;
    const k0 = Math.max(0, Math.ceil(Z - rz)), k1 = Math.min(gz - 1, Math.floor(Z + rz));
    const j0 = Math.max(0, Math.ceil(Y - ry)), j1 = Math.min(gy - 1, Math.floor(Y + ry));
    const i0 = Math.max(0, Math.ceil(X - rx)), i1 = Math.min(gx - 1, Math.floor(X + rx));
    for (let k = k0; k <= k1; k++) {
      const dz = (k - Z) / rz;
      for (let j = j0; j <= j1; j++) {
        const dy = (j - Y) / ry;
        for (let ii = i0; ii <= i1; ii++) {
          const dx = (ii - X) / rx;
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 >= 1) continue;
          const f = (1 - r2) * (1 - r2) * (1 - r2);
          const at = ii + gx * (j + gy * k);
          if (!seen[at]) {
            seen[at] = 1;
            touched[touchedCount++] = at;
          }
          dens[at] += f;
          hot[at] += f * t[i];
        }
      }
    }
  }
  flush();
  const wax = new Uint8Array(size), heat = new Uint8Array(size);
  const full = 0.75 * w.deep;
  warm.fill(0);
  weight.fill(0);
  for (let a = 0; a < size; a++) {
    const share = Math.min(1, best[a] / full);
    wax[a] = Math.round(share * 255);
    if (best[a] > 1e-4) {
      warm[a] = bestHot[a] * share;
      weight[a] = share;
    }
  }
  blur(warm, dims, 2);
  blur(weight, dims, 2);
  for (let a = 0; a < size; a++) {
    const T = best[a] > 1e-4 && weight[a] > 1e-6 ? warm[a] / weight[a] : liquidAt(lamp.params, (Math.floor(a / gx) % gy + 0.5) / gy);
    heat[a] = Math.max(0, Math.min(255, Math.round(((T - 20) / 50) * 255)));
  }
  return { wax, heat, dims };
}

/** What a cell deep in wax gathers: a ball's weights over the lattice the wax rests as. */
function deepOf(lamp: Lamp, cell: number[], rx: number, ry: number, rz: number): number {
  const sp = lamp.spacing, cells = (sp * sp * sp) / (cell[0] * cell[1] * cell[2]);
  let sum = 0;
  const steps = 24;
  for (let a = 0; a < steps; a++)
    for (let b = 0; b < steps; b++)
      for (let c = 0; c < steps; c++) {
        const dx = (2 * (a + 0.5)) / steps - 1, dy = (2 * (b + 0.5)) / steps - 1, dz = (2 * (c + 0.5)) / steps - 1;
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < 1) sum += (1 - r2) ** 3;
      }
  // The ball's integral over its volume, in cells, divided by the cells a particle holds.
  return ((sum / (steps * steps * steps)) * 8 * rx * ry * rz) / cells;
}

/** A box blur of `r` cells each way along each axis in turn, in place. */
export function blur(field: Float32Array, [gx, gy, gz]: [number, number, number], r: number) {
  const line = new Float32Array(Math.max(gx, gy, gz));
  const pass = (count: number, stride: number, starts: number[]) => {
    for (const s0 of starts) {
      for (let k = 0; k < count; k++) line[k] = field[s0 + k * stride];
      let sum = 0;
      for (let k = 0; k < Math.min(r, count); k++) sum += line[k];
      for (let k = 0; k < count; k++) {
        if (k + r < count) sum += line[k + r];
        if (k - r - 1 >= 0) sum -= line[k - r - 1];
        field[s0 + k * stride] = sum / (2 * r + 1);
      }
    }
  };
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let k = 0; k < gz; k++) for (let j = 0; j < gy; j++) xs.push(gx * (j + gy * k));
  for (let k = 0; k < gz; k++) for (let i = 0; i < gx; i++) ys.push(i + gx * gy * k);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) zs.push(i + gx * j);
  pass(gx, 1, xs);
  pass(gy, gx, ys);
  pass(gz, gx * gy, zs);
}
