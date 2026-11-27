/**
 * The lamp's wax as particles in 3D: smoothed particle hydrodynamics, position-based, after Clavet,
 * Beaudoin and Poulin's double density relaxation (2005), with the liquid round it as the medium it
 * moves through rather than particles of its own.
 *
 * Each particle carries a temperature. Wax is a little heavier than the liquid when cool and a little
 * lighter when warm, crossing over at `crossover`, and lifts in proportion to the warmth of the wax
 * round it, up to a limit. Drag holds it back, most at the skin. Its skin has surface tension (Akinci,
 * Akinci and Teschner, 2013), so blobs round off and a stretched neck thins and breaks. Each particle
 * belongs to a blob: blobs that meet press together and slide past each other, and run into one only
 * after `drain` seconds touching, as the liquid between real blobs takes to drain. Neighbours share
 * velocity and heat. The liquid lies in layers, warmer below and cooler above, takes heat from the
 * wax's skin, and carries the wax on slow currents of its own. A coil under the middle of the floor
 * heats the wax lying on it, its heat swelling and fading every `pulse` seconds.
 *
 * Pure: no DOM, nothing from the page. Units: the lamp is 1 tall; seconds; degrees Celsius.
 */

export type Params = {
  /** The lamp's width and depth, as a share of its height, and how many particles of wax. */
  width: number;
  count: number;
  /** Where wax and liquid weigh the same, and how many degrees past it give a mass its `lift`. */
  crossover: number;
  spread: number;
  /** Lift, heights a second squared, for every `spread` degrees past the crossover, up to `most` of it. */
  lift: number;
  most: number;
  /** Drag from the liquid, a second: inside a mass, and more at its skin. */
  drag: number;
  skinDrag: number;
  /** How much of its neighbours' velocity each takes on, a step. */
  viscosity: number;
  /** How hard particles keep to their rest density, a share a step, and apart up close. */
  stiff: number;
  near: number;
  /** Surface tension, heights a second squared. */
  tension: number;
  /** How long two blobs touching stay two, seconds, and how much of the shared velocity they share. */
  drain: number;
  slide: number;
  /** The liquid's currents, heights a second, and how long they take to turn over, seconds. */
  currents: number;
  currentsEvery: number;
  /** Heat shared with neighbours, a second; taken by the liquid inside a mass and at its skin. */
  share: number;
  cool: number;
  skinCool: number;
  /** The liquid's warmth at the floor and the top. */
  warm: number;
  cold: number;
  /** The coil: its radius, how high its heat reaches, degrees a second, the warmest it heats to, and its swell's period. */
  coil: number;
  coilHeight: number;
  heat: number;
  hottest: number;
  pulse: number;
  /** How warm the pool starts, and a step, seconds. */
  start: number;
  dt: number;
};

const BASE: Params = {
  width: 0.4,
  count: 8000,
  crossover: 50,
  spread: 4,
  lift: 0.25,
  most: 1.25,
  drag: 2.5,
  skinDrag: 3,
  viscosity: 0.02,
  stiff: 0.35,
  near: 2,
  tension: 0.1,
  drain: 30,
  slide: 0.2,
  currents: 0.03,
  currentsEvery: 40,
  share: 0.15,
  cool: 0.006,
  skinCool: 0.1,
  warm: 46,
  cold: 38,
  coil: 0.08,
  coilHeight: 0.03,
  heat: 6,
  hottest: 62,
  pulse: 45,
  start: 47.5,
  dt: 1 / 60,
};

export type Mood = "busy" | "calm";

/**
 * The two lamps, tuned to footage of real ones and measured as it was (optical flow on their frames):
 * both rise, sink and drift at a real lamp's speeds. Busy is hotter, a stem often reaching the top and
 * feeding what gathers there; calm is cooler, one plume at a time.
 */
export const MOODS: Record<Mood, Params> = {
  busy: BASE,
  calm: { ...BASE, lift: 0.3, heat: 3, pulse: 60 },
};

export type Lamp = {
  params: Params;
  n: number;
  /** The particles' spacing at rest, and the reach of their smoothing. */
  spacing: number;
  reach: number;
  /** A particle's density deep in wax, and how long a flat skin's normal comes out, before it's made a unit. */
  rest: number;
  flat: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  t: Float32Array;
  /** How full each particle's surroundings are, 0 (alone) to 1 (deep inside). */
  full: Float32Array;
  /** Which blob each particle is part of, the next label free, and how long each pair of blobs has touched. */
  body: Int32Array;
  bodies: number;
  contact: Map<string, number>;
  time: number;
  steps: number;
};

/** A seeded generator (mulberry32), so a lamp starts the same each time. */
export function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How deep the pool lies at the start, as a share of the height. */
const POOL = 0.15;

/**
 * A lamp: the wax a pool on the floor, on a jittered lattice. Settled, the pool is let rest before
 * anything heats it: the lattice isn't quite how the particles rest together, and let go as it is it
 * would spring apart and throw its top layer up the lamp.
 */
export function lampOf(params: Params, settled = true): Lamp {
  const p = params;
  const W = p.width;
  const spacing = Math.cbrt((W * W * POOL) / p.count);
  const random = generator(1);
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let k = 0; (k + 0.5) * spacing <= W; k++)
    for (let j = 0; (j + 0.5) * spacing <= POOL; j++)
      for (let i = 0; (i + 0.5) * spacing <= W; i++) {
        xs.push((i + 0.5) * spacing + (random() - 0.5) * 0.1 * spacing);
        ys.push((j + 0.5) * spacing + (random() - 0.5) * 0.1 * spacing);
        zs.push((k + 0.5) * spacing + (random() - 0.5) * 0.1 * spacing);
      }
  const n = xs.length;
  const lamp: Lamp = {
    params: p,
    n,
    spacing,
    reach: 2 * spacing,
    rest: 1,
    flat: 1,
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    z: Float32Array.from(zs),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    vz: new Float32Array(n),
    t: new Float32Array(n).fill(p.start),
    full: new Float32Array(n),
    body: new Int32Array(n),
    bodies: 1,
    contact: new Map(),
    time: 0,
    steps: 0,
  };
  // The rest density: the most a particle in the lattice gathers, a little under.
  const s = scratchOf(lamp);
  findPairs(lamp, s);
  const rho = new Float32Array(n);
  for (let k = 0; k < s.count; k++) {
    const q2 = s.q[k] * s.q[k];
    rho[s.a[k]] += q2;
    rho[s.b[k]] += q2;
  }
  lamp.rest = Math.max(...rho) * 0.98;
  // A flat skin on the lattice: the neighbours below, each pushing the normal out by its q.
  let flat = 0;
  for (let a = -2; a <= 2; a++)
    for (let b = -2; b < 0; b++)
      for (let c = -2; c <= 2; c++) {
        const d = Math.hypot(a, b, c);
        if (d < 2) flat += (1 - d / 2) * (-b / d);
      }
  lamp.flat = flat;
  if (!settled) return lamp;
  lamp.params = { ...p, lift: 0, heat: 0, cool: 0, skinCool: 0, share: 0, tension: 0, currents: 0 };
  for (let k = 0; k < 240; k++) {
    step(lamp);
    lamp.vx.fill(0);
    lamp.vy.fill(0);
    lamp.vz.fill(0);
  }
  lamp.params = p;
  lamp.t.fill(p.start);
  lamp.body.fill(0);
  lamp.bodies = 1;
  lamp.contact.clear();
  lamp.time = 0;
  lamp.steps = 0;
  return lamp;
}

type Scratch = {
  // The neighbour grid: cells as wide as the reach, each cell's particles together.
  nx: number;
  ny: number;
  nz: number;
  start: Int32Array;
  order: Int32Array;
  cellOf: Int32Array;
  // Every pair within reach, once.
  a: Int32Array;
  b: Int32Array;
  q: Float32Array;
  count: number;
  parent: Int32Array;
  f: Record<"rho" | "near" | "tw" | "ts" | "heat" | "wv" | "sx" | "sy" | "sz" | "px" | "py" | "pz" | "mx" | "my" | "mz" | "nX" | "nY" | "nZ" | "fX" | "fY" | "fZ" | "cuX" | "cuY" | "cuZ", Float32Array>;
};

const scratches = new WeakMap<Lamp, Scratch>();

function scratchOf(lamp: Lamp): Scratch {
  let s = scratches.get(lamp);
  if (s) return s;
  const r = lamp.reach, W = lamp.params.width, n = lamp.n;
  const nx = Math.ceil(W / r) + 1, ny = Math.ceil(1 / r) + 1, nz = Math.ceil(W / r) + 1;
  const names = ["rho", "near", "tw", "ts", "heat", "wv", "sx", "sy", "sz", "px", "py", "pz", "mx", "my", "mz", "nX", "nY", "nZ", "fX", "fY", "fZ", "cuX", "cuY", "cuZ"] as const;
  const f = {} as Scratch["f"];
  for (const name of names) f[name] = new Float32Array(n);
  s = {
    nx, ny, nz,
    start: new Int32Array(nx * ny * nz + 2),
    order: new Int32Array(n),
    cellOf: new Int32Array(n),
    a: new Int32Array(n * 24),
    b: new Int32Array(n * 24),
    q: new Float32Array(n * 24),
    count: 0,
    parent: new Int32Array(n),
    f,
  };
  scratches.set(lamp, s);
  return s;
}

/**
 * Every pair within reach, each once: a cell with itself (later particles only) and with the 13 cells
 * ahead of it, which lie in five runs of the grid's order; positions copied into that order first.
 */
function findPairs(lamp: Lamp, s: Scratch) {
  const { x, y, z, n, reach } = lamp;
  const { nx, ny, nz, start, order, cellOf } = s;
  const cells = nx * ny * nz;
  start.fill(0);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(nx - 1, Math.max(0, Math.floor(x[i] / reach)));
    const cy = Math.min(ny - 1, Math.max(0, Math.floor(y[i] / reach)));
    const cz = Math.min(nz - 1, Math.max(0, Math.floor(z[i] / reach)));
    const c = cx + nx * (cy + ny * cz);
    cellOf[i] = c;
    start[c + 1]++;
  }
  for (let c = 0; c < cells; c++) start[c + 1] += start[c];
  start[cells + 1] = start[cells];
  const fill = start.slice(0, cells);
  for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;
  const ox = s.f.mx, oy = s.f.my, oz = s.f.mz;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    ox[k] = x[i];
    oy[k] = y[i];
    oz[k] = z[i];
  }
  let { a, b, q } = s;
  let count = 0;
  const r2 = reach * reach;
  const runs = new Int32Array(10);
  for (let cz = 0; cz < nz; cz++)
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++) {
        const c = cx + nx * (cy + ny * cz);
        const from = start[c], to = start[c + 1];
        if (from === to) continue;
        let m = 0;
        const x0 = cx > 0 ? cx - 1 : 0, x1 = cx < nx - 1 ? cx + 1 : nx - 1;
        if (cx < nx - 1) { runs[m++] = start[c + 1]; runs[m++] = start[c + 2]; }
        if (cy < ny - 1) { const row = nx * (cy + 1 + ny * cz); runs[m++] = start[row + x0]; runs[m++] = start[row + x1 + 1]; }
        if (cz < nz - 1)
          for (let ky = cy > 0 ? cy - 1 : 0; ky <= (cy < ny - 1 ? cy + 1 : ny - 1); ky++) {
            const row = nx * (ky + ny * (cz + 1));
            runs[m++] = start[row + x0];
            runs[m++] = start[row + x1 + 1];
          }
        for (let k = from; k < to; k++) {
          if (count + (to - k) + 512 > a.length) {
            const grow = (o: Int32Array) => { const r = new Int32Array(o.length * 2); r.set(o); return r; };
            a = grow(a);
            b = grow(b);
            const r = new Float32Array(q.length * 2);
            r.set(q);
            q = r;
          }
          const xi = ox[k], yi = oy[k], zi = oz[k], i = order[k];
          for (let k2 = k + 1; k2 < to; k2++) {
            const dx = ox[k2] - xi, dy = oy[k2] - yi, dz = oz[k2] - zi;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2) continue;
            a[count] = i; b[count] = order[k2]; q[count] = 1 - Math.sqrt(d2) / reach; count++;
          }
          for (let r = 0; r < m; r += 2)
            for (let k2 = runs[r], e = runs[r + 1]; k2 < e; k2++) {
              const dx = ox[k2] - xi, dy = oy[k2] - yi, dz = oz[k2] - zi;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= r2) continue;
              a[count] = i; b[count] = order[k2]; q[count] = 1 - Math.sqrt(d2) / reach; count++;
            }
        }
      }
  s.a = a;
  s.b = b;
  s.q = q;
  s.count = count;
}

/**
 * Keeps the blobs' labels: a blob whose neck broke becomes two (the larger part keeps its label), and
 * two that have touched for `drain` seconds become one (the smaller takes the larger's). Joined, within
 * a blob, is closer than 1.4 spacings; touching, between blobs, three pairs of particles or more closer
 * than 1.8, since nothing pulls pressed blobs together and they rest a little apart. Parted, their time
 * resets.
 */
export function relabel(lamp: Lamp, interval: number) {
  const s = scratchOf(lamp);
  const { n, body } = lamp;
  const { a, b, q, count, parent } = s;
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let k = 0; k < count; k++) {
    if (q[k] < 0.3) continue;
    const i = a[k], j = b[k];
    if (body[i] !== body[j]) continue;
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  // Each label's parts: the largest keeps it, every other part gets a new one.
  const size = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    size.set(r, (size.get(r) ?? 0) + 1);
  }
  const biggest = new Map<number, number>();
  for (const [r, c] of size) {
    const best = biggest.get(body[r]);
    if (best === undefined || c > (size.get(best) ?? 0)) biggest.set(body[r], r);
  }
  const fresh = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (biggest.get(body[i]) === r) continue;
    let label = fresh.get(r);
    if (label === undefined) fresh.set(r, (label = lamp.bodies++));
    body[i] = label;
  }
  // Touching blobs: how long each pair has touched; past `drain`, the smaller joins the larger.
  const touching = new Map<string, number>();
  for (let k = 0; k < count; k++) {
    if (q[k] < 0.1) continue;
    const bi = body[a[k]], bj = body[b[k]];
    if (bi === bj) continue;
    const key = bi < bj ? `${bi},${bj}` : `${bj},${bi}`;
    touching.set(key, (touching.get(key) ?? 0) + 1);
  }
  const held = new Map<string, number>();
  const joins: [number, number][] = [];
  for (const [key, pairs] of touching) {
    if (pairs < 3) continue;
    const time = (lamp.contact.get(key) ?? 0) + interval;
    if (time >= lamp.params.drain) {
      const [u, v] = key.split(",").map(Number);
      joins.push([u, v]);
    } else held.set(key, time);
  }
  lamp.contact = held;
  if (!joins.length) return;
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) counts.set(body[i], (counts.get(body[i]) ?? 0) + 1);
  const into = new Map<number, number>();
  const root = (l: number): number => {
    while (into.has(l)) l = into.get(l)!;
    return l;
  };
  for (const [u, v] of joins) {
    const ru = root(u), rv = root(v);
    if (ru === rv) continue;
    const [small, large] = (counts.get(ru) ?? 0) < (counts.get(rv) ?? 0) ? [ru, rv] : [rv, ru];
    into.set(small, large);
    counts.set(large, (counts.get(large) ?? 0) + (counts.get(small) ?? 0));
  }
  for (let i = 0; i < n; i++) if (into.has(body[i])) body[i] = root(body[i]);
}

/** The liquid's warmth at a height. */
export function liquidAt(p: Params, y: number): number {
  return p.warm + (p.cold - p.warm) * Math.min(1, Math.max(0, y));
}

/**
 * The liquid's currents: eight waves of flow, each along a direction square to its own wavevector (so
 * none piles liquid up or empties it anywhere), a third to two thirds of the height long, each phase
 * drifting on a clock of its own. Seeded: every lamp's currents are the same.
 */
const WAVES = (() => {
  const random = generator(12345);
  const waves: { k: [number, number, number]; e: [number, number, number]; rate: number; phase: number }[] = [];
  for (let w = 0; w < 8; w++) {
    const length = 0.33 + 0.33 * random();
    const u = 2 * random() - 1, a = 2 * Math.PI * random();
    const d: [number, number, number] = [Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a)];
    const k = d.map((c) => (c * 2 * Math.PI) / length) as [number, number, number];
    const helper: [number, number, number] = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = [d[1] * helper[2] - d[2] * helper[1], d[2] * helper[0] - d[0] * helper[2], d[0] * helper[1] - d[1] * helper[0]];
    const n1 = Math.hypot(e1[0], e1[1], e1[2]);
    const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
    const b = 2 * Math.PI * random();
    const e = [0, 1, 2].map((c) => (Math.cos(b) * e1[c]) / n1 + (Math.sin(b) * e2[c]) / n1) as [number, number, number];
    waves.push({ k, e, rate: 0.6 + 0.8 * random(), phase: 2 * Math.PI * random() });
  }
  return waves;
})();

export function currentsAt(p: Params, x: number, y: number, z: number, time: number): [number, number, number] {
  let ux = 0, uy = 0, uz = 0;
  const clock = (2 * Math.PI * time) / p.currentsEvery;
  for (const w of WAVES) {
    const c = Math.cos(w.k[0] * x + w.k[1] * y + w.k[2] * z + w.phase + w.rate * clock);
    ux += w.e[0] * c;
    uy += w.e[1] * c;
    uz += w.e[2] * c;
  }
  // Eight waves of unit strength add to about the square root of four: scaled to `currents`.
  const s = p.currents / 2;
  return [ux * s, uy * s, uz * s];
}

/** Moves the lamp on a step. */
export function step(lamp: Lamp) {
  const p = lamp.params;
  const { n, x, y, z, vx, vy, vz, t, full, reach, rest, body } = lamp;
  const dt = p.dt, W = p.width, sp = lamp.spacing;
  const s = scratchOf(lamp);
  findPairs(lamp, s);
  const { a, b, q, count } = s;
  const { rho, near, tw, ts, heat, wv, sx, sy, sz, px, py, pz, mx, my, mz, nX, nY, nZ, fX, fY, fZ, cuX, cuY, cuZ } = s.f;
  if (lamp.steps % 6 === 0) relabel(lamp, 6 * dt);

  // How full each one's surroundings are; the warmth of the wax round it; heat and velocity shared
  // (blobs not yet run together sharing a little of it, so they slide past each other).
  for (let i = 0; i < n; i++) {
    rho[i] = 0; tw[i] = 1; ts[i] = t[i]; heat[i] = 0; wv[i] = 0; sx[i] = 0; sy[i] = 0; sz[i] = 0;
  }
  for (let k = 0; k < count; k++) {
    const i = a[k], j = b[k], w = q[k], w2 = w * w;
    rho[i] += w2; rho[j] += w2;
    tw[i] += w2; tw[j] += w2;
    ts[i] += w2 * t[j]; ts[j] += w2 * t[i];
    const dT = w * (t[j] - t[i]);
    heat[i] += dT; heat[j] -= dT;
    wv[i] += w; wv[j] += w;
    const v = body[i] !== body[j] ? w * p.slide : w;
    const ux = v * (vx[j] - vx[i]), uy = v * (vy[j] - vy[i]), uz = v * (vz[j] - vz[i]);
    sx[i] += ux; sy[i] += uy; sz[i] += uz;
    sx[j] -= ux; sy[j] -= uy; sz[j] -= uz;
  }

  // Surface tension, within each blob: each skin's normal, into the wax; a cohesion between
  // neighbours (pushing apart up close, pulling together further out) and a pull toward the normals
  // of the skin round it, so a bulge is drawn in and a neck drawn thinner.
  const tense = p.tension > 0;
  if (tense) {
    nX.fill(0); nY.fill(0); nZ.fill(0); fX.fill(0); fY.fill(0); fZ.fill(0);
    for (let k = 0; k < count; k++) {
      const i = a[k], j = b[k], w = q[k];
      if (body[i] !== body[j]) continue;
      const d = (1 - w) * reach;
      if (d < 1e-9) continue;
      const ux = (x[i] - x[j]) / d, uy = (y[i] - y[j]) / d, uz = (z[i] - z[j]) / d;
      nX[i] -= w * ux; nY[i] -= w * uy; nZ[i] -= w * uz;
      nX[j] += w * ux; nY[j] += w * uy; nZ[j] += w * uz;
    }
    const f = 1 / lamp.flat;
    for (let i = 0; i < n; i++) { nX[i] *= f; nY[i] *= f; nZ[i] *= f; }
    const g = p.tension;
    for (let k = 0; k < count; k++) {
      const i = a[k], j = b[k], w = q[k];
      if (body[i] !== body[j]) continue;
      const r = 1 - w, d = r * reach;
      if (d < 1e-9) continue;
      const K = (2 * rest) / (rho[i] + rho[j] + 1e-9);
      // Akinci's cohesion spline, scaled to 1 at its peak: -1 at no distance, 1 at half the reach.
      const r3 = r * r * r, o3 = w * w * w;
      const c = r > 0.5 ? 64 * o3 * r3 : 128 * o3 * r3 - 1;
      const ux = (x[i] - x[j]) / d, uy = (y[i] - y[j]) / d, uz = (z[i] - z[j]) / d;
      const ex = -g * K * (c * ux + (nX[i] - nX[j]));
      const ey = -g * K * (c * uy + (nY[i] - nY[j]));
      const ez = -g * K * (c * uz + (nZ[i] - nZ[j]));
      fX[i] += ex; fY[i] += ey; fZ[i] += ez;
      fX[j] -= ex; fY[j] -= ey; fZ[j] -= ez;
    }
  }

  // Heat, lift, viscosity, drag; then where each would go.
  const cx = W / 2, cz = W / 2;
  const swell = p.pulse > 0 ? 1 - Math.cos((2 * Math.PI * lamp.time) / p.pulse) : 1;
  const flow = p.currents > 0, fresh = lamp.steps % 4 === 0;
  for (let i = 0; i < n; i++) {
    full[i] = Math.min(1, rho[i] / rest);
    const skin = 1 - full[i];
    // Heat: what neighbours share, what the liquid takes (most at the skin), what the coil gives.
    let rate = (p.share * heat[i]) / (1 + wv[i]) + (p.cool + p.skinCool * skin * skin) * (liquidAt(p, y[i]) - t[i]);
    if (y[i] < p.coilHeight && t[i] < p.hottest) {
      const dx = x[i] - cx, dz = z[i] - cz;
      const r2 = (dx * dx + dz * dz) / (p.coil * p.coil);
      if (r2 < 1) rate += p.heat * swell * (1 - r2);
    }
    t[i] += rate * dt;
    // Lift by the warmth of the wax round it, in proportion, up to `most`.
    const warmth = (ts[i] / tw[i] - p.crossover) / p.spread;
    vy[i] += p.lift * Math.max(-p.most, Math.min(p.most, warmth)) * dt;
    if (tense) {
      vx[i] += fX[i] * dt;
      vy[i] += fY[i] * dt;
      vz[i] += fZ[i] * dt;
    }
    if (wv[i] > 0) {
      const v = p.viscosity / wv[i];
      vx[i] += v * sx[i];
      vy[i] += v * sy[i];
      vz[i] += v * sz[i];
    }
    // Drag toward the liquid's own currents, worked out every fourth step: they change slowly.
    if (flow && fresh) [cuX[i], cuY[i], cuZ[i]] = currentsAt(p, x[i], y[i], z[i], lamp.time);
    const fx = flow ? cuX[i] : 0, fy = flow ? cuY[i] : 0, fz = flow ? cuZ[i] : 0;
    const drag = 1 / (1 + (p.drag + p.skinDrag * skin) * dt);
    vx[i] = fx + (vx[i] - fx) * drag;
    vy[i] = fy + (vy[i] - fy) * drag;
    vz[i] = fz + (vz[i] - fz) * drag;
    px[i] = x[i];
    py[i] = y[i];
    pz[i] = z[i];
    x[i] += vx[i] * dt;
    y[i] += vy[i] * dt;
    z[i] += vz[i] * dt;
  }

  // Double density relaxation: pairs pushed apart where it's crowded and drawn together where it's
  // thin, kept from piling up close; blobs not yet run together only ever pushed apart.
  for (let i = 0; i < n; i++) { rho[i] = 0; near[i] = 0; mx[i] = 0; my[i] = 0; mz[i] = 0; }
  for (let k = 0; k < count; k++) {
    const i = a[k], j = b[k];
    const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const w = d < reach ? 1 - d / reach : 0;
    q[k] = w;
    const w2 = w * w;
    rho[i] += w2; rho[j] += w2;
    near[i] += w2 * w; near[j] += w2 * w;
  }
  for (let i = 0; i < n; i++) {
    rho[i] = (p.stiff * (rho[i] - rest)) / rest;
    near[i] = (p.stiff * p.near * near[i]) / rest;
  }
  for (let k = 0; k < count; k++) {
    const w = q[k];
    if (w <= 0) continue;
    const i = a[k], j = b[k];
    const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-9) continue;
    const P = body[i] !== body[j] ? Math.max(0, rho[i] + rho[j]) : rho[i] + rho[j];
    const D = (0.5 * sp * (P * w + (near[i] + near[j]) * w * w)) / d;
    mx[j] += D * dx; my[j] += D * dy; mz[j] += D * dz;
    mx[i] -= D * dx; my[i] -= D * dy; mz[i] -= D * dz;
  }

  // The lamp's walls, and velocities from where everything moved.
  const pad = 0.5 * sp;
  for (let i = 0; i < n; i++) {
    const xi = Math.min(W - pad, Math.max(pad, x[i] + mx[i]));
    const yi = Math.min(1 - pad, Math.max(pad, y[i] + my[i]));
    const zi = Math.min(W - pad, Math.max(pad, z[i] + mz[i]));
    x[i] = xi;
    y[i] = yi;
    z[i] = zi;
    vx[i] = (xi - px[i]) / dt;
    vy[i] = (yi - py[i]) / dt;
    vz[i] = (zi - pz[i]) / dt;
  }
  lamp.time += dt;
  lamp.steps++;
}
