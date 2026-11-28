/**
 * The lamp's wax as particles in 3D: smoothed particle hydrodynamics, position-based, after Clavet,
 * Beaudoin and Poulin's double density relaxation (2005), with the liquid round it as the medium it
 * moves through rather than particles of its own.
 *
 * Each particle carries a temperature. Wax is a little heavier than the liquid when cool and a little
 * lighter when warm, crossing over at `crossover`, and lifts in proportion to the warmth of the wax
 * round it, up to a limit. Drag holds it back, most at the skin. Its skin has surface tension (Akinci,
 * Akinci and Teschner, 2013), so blobs round off and a stretched neck thins; a neck down to its skin
 * parts within `pinch` seconds, a thread's middle going off as beads. Each particle
 * belongs to a blob: blobs that meet press together and slide past each other, and run into one only
 * after `drain` seconds touching, as the liquid between real blobs takes to drain (sooner into the
 * pool, warm and soft on the coil). Neighbours share
 * velocity and heat. The liquid lies in layers, warmer below and cooler above, takes heat from the
 * wax's skin, and carries the wax on slow currents of its own. A coil under the middle of the floor
 * heats the wax lying on it, steadily, as a bulb does.
 *
 * Pure: no DOM, nothing from the page. Units: the lamp is 1 tall; seconds; degrees Celsius.
 */

export type Params = {
  /** The tank's width and depth, as shares of its height, and how many particles of wax. */
  width: number;
  depth: number;
  count: number;
  /** Where wax and liquid weigh the same, and how many degrees past it give a mass its `lift`. */
  crossover: number;
  spread: number;
  /** Lift, heights a second squared, for every `spread` degrees past the crossover, up to `most` of it. */
  lift: number;
  most: number;
  /**
   * How many times as heavy cool wax lying on the floor is (the pool's, and a blob's once it lands):
   * more than 1 settles it into one layer, as a real pool's own weight does, while blobs in the liquid
   * fall at their own speed.
   */
  settle: number;
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
  /** How many times faster a blob runs into the pool (the largest blob), warm and soft on the coil. */
  poolDrain: number;
  slide: number;
  /** How long a neck stays thin before it parts, seconds; 0 leaves necks to the skin alone. */
  pinch: number;
  /**
   * For a neck: how many same-blob neighbours within reach (on average over itself and them) a
   * particle needs to be inside wax rather than at its skin; deep wax has about 27, a skin about 21.
   */
  inside: number;
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
  /** Where the coils lie across the floor (each in the middle of the depth), their radius, how high
   * their heat reaches, degrees a second, and the warmest they heat to. */
  coils: number[];
  coil: number;
  coilHeight: number;
  heat: number;
  hottest: number;
  /**
   * Whether the wax lies on the floor and against the sides as on more wax (1) or beads on them (0):
   * they then hold wax as if more lay mirrored past them, so the pool's bottom and ends aren't a skin
   * its tension draws up into mounds, and the pool lies as one layer across the floor, wall to wall.
   * The front and back are glass the wax keeps off.
   */
  wet: number;
  /** How deep the pool lies at the start, as a share of the height. */
  pool: number;
  /** How warm the pool starts, and a step, seconds. */
  start: number;
  dt: number;
};

const BASE: Params = {
  width: 0.4,
  depth: 0.4,
  count: 8000,
  crossover: 50,
  spread: 4,
  lift: 0.25,
  most: 1.25,
  settle: 1,
  drag: 2.5,
  skinDrag: 3,
  viscosity: 0.02,
  stiff: 0.35,
  near: 2,
  tension: 0.1,
  drain: 30,
  poolDrain: 4,
  slide: 0.2,
  pinch: 1,
  inside: 24.5,
  currents: 0.03,
  currentsEvery: 40,
  share: 0.15,
  cool: 0.006,
  skinCool: 0.1,
  warm: 46,
  cold: 38,
  coils: [0.2],
  coil: 0.08,
  coilHeight: 0.03,
  heat: 6,
  hottest: 62,
  wet: 0,
  pool: 0.15,
  start: 47.5,
  dt: 1 / 60,
};

export type Mood = "busy" | "calm";

/**
 * The two lamps, tuned to footage of real ones and measured as it was (optical flow on their frames):
 * both rise, sink and drift at a real lamp's speeds. Busy is hotter, plume after plume, a crowd of blobs
 * gathering under the top; calm is cooler, one plume at a time.
 */
export const MOODS: Record<Mood, Params> = {
  busy: BASE,
  calm: { ...BASE, lift: 0.3, heat: 4 },
};

/** A tank shaped as a box is: this deep, as a share of its height. */
export const DEEP = 0.3;
/** How wide a box's tank may be (16:9); a wider box shows a band of it. */
export const WIDEST = 16 / 9;
/** How many particles the widest box's tank holds; a narrower one has as many as its share. */
const BOX_MOST = 10000;
/**
 * How much hotter a box's coils are than the lamp's: its pool spreads across a wide floor, so less of
 * it lies over each coil.
 */
const BOX_HEAT = 1.2;
/**
 * How many times as heavy a box's cool wax lying on the floor is: at the lamp's own weight a wide
 * pool drew itself into a mound in the middle, off both walls; three times settles it into a layer
 * while blobs in the liquid fall at nearly their own speed.
 */
const BOX_SETTLE = 3;
/** One coil every this much of a box tank's width, laid out from the middle of the widest. */
const COIL_EVERY = 0.6;

/**
 * The coils of a tank `width` wide: the widest's, one every `COIL_EVERY` from its middle, cut down to
 * this width round the same middle (so a tank's start, cut from the widest's, has its plumes over its
 * coils), each clear of the walls; one in the middle where none is.
 */
export function coilsOf(width: number, radius: number): number[] {
  const count = Math.max(1, Math.round(WIDEST / COIL_EVERY));
  const offset = (WIDEST - width) / 2;
  const coils: number[] = [];
  for (let k = 0; k < count; k++) {
    const at = (k + 0.5) * (WIDEST / count) - offset;
    if (at >= radius && at <= width - radius) coils.push(at);
  }
  return coils.length ? coils : [width / 2];
}

/**
 * A lamp's params in a tank of any shape: the lamp's own (0.4 as wide as it's tall, as deep as it's
 * wide), or a box `aspect` times as wide as it's tall and `DEEP` deep. A box's wax is coarser than the
 * lamp's (the widest holds `BOX_MOST` particles, which a phone keeps up with), so its blobs come out a
 * little larger, as they would in a smaller lamp; the coils are scaled with it, one every
 * `COIL_EVERY`, and hotter (`BOX_HEAT`); and its floor and sides are `wet`, so the pool lies as one
 * layer across it rather than beading between the coils.
 */
export function tankOf(mood: Mood, aspect: number | "lamp"): Params {
  const p = MOODS[mood] ?? MOODS.busy;
  if (aspect === "lamp") return p;
  const width = Math.min(WIDEST, Math.max(0.3, aspect));
  const BOX_SPACING = Math.cbrt((WIDEST * DEEP * p.pool) / BOX_MOST);
  const scale = BOX_SPACING / spacingOf(p);
  const coil = p.coil * scale;
  return {
    ...p,
    width,
    depth: DEEP,
    count: Math.round((width * DEEP * p.pool) / BOX_SPACING ** 3),
    coils: coilsOf(width, coil),
    coil,
    coilHeight: p.coilHeight * scale,
    heat: p.heat * BOX_HEAT,
    settle: BOX_SETTLE,
    wet: 1,
  };
}

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
  /** How long each blob's neck has been thin. */
  necks: Map<number, number>;
  /** Whether each particle's blob lies on the floor, as last labelled (kept only where `settle` asks). */
  floored: Uint8Array;
  time: number;
  steps: number;
};

/** A lamp like `lamp` (its params, spacing and rest density) with room for `n` particles, none placed yet. */
export function withRoom(lamp: Lamp, n: number): Lamp {
  return {
    ...lamp,
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    vz: new Float32Array(n),
    t: new Float32Array(n),
    full: new Float32Array(n),
    body: new Int32Array(n),
    bodies: 1,
    contact: new Map(),
    necks: new Map(),
    floored: new Uint8Array(n),
    time: 0,
    steps: 0,
  };
}

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

/** The particles' spacing at rest, in the lamp's units (it's 1 tall). */
export const spacingOf = (p: Pick<Params, "width" | "depth" | "count" | "pool">) => Math.cbrt((p.width * p.depth * p.pool) / p.count);

/**
 * A lamp: the wax a pool on the floor, on a jittered lattice. Settled, the pool is let rest before
 * anything heats it: the lattice isn't quite how the particles rest together, and let go as it is it
 * would spring apart and throw its top layer up the lamp.
 */
export function lampOf(params: Params, settled = true): Lamp {
  const p = params;
  const W = p.width, D = p.depth;
  const spacing = spacingOf(p);
  const random = generator(1);
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let k = 0; (k + 0.5) * spacing <= D; k++)
    for (let j = 0; (j + 0.5) * spacing <= p.pool; j++)
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
    necks: new Map(),
    floored: new Uint8Array(n),
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
  lamp.necks.clear();
  lamp.floored.fill(0);
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
  // The necks: same-blob neighbours (and their average round each), the parts' union, which part
  // each particle goes with and how far.
  near2: Int32Array;
  around: Float32Array;
  part: Int32Array;
  owner: Int32Array;
  hops: Uint8Array;
  /** A wetted floor's wax, by height (see `floorOf`); empty where the wax beads on the floor. */
  floor: Floor | null;
  f: Record<"rho" | "near" | "tw" | "ts" | "heat" | "wv" | "sx" | "sy" | "sz" | "px" | "py" | "pz" | "mx" | "my" | "mz" | "nX" | "nY" | "nZ" | "fX" | "fY" | "fZ" | "cuX" | "cuY" | "cuZ", Float32Array>;
};

const scratches = new WeakMap<Lamp, Scratch>();

function scratchOf(lamp: Lamp): Scratch {
  let s = scratches.get(lamp);
  if (s) return s;
  const r = lamp.reach, W = lamp.params.width, D = lamp.params.depth, n = lamp.n;
  const nx = Math.ceil(W / r) + 1, ny = Math.ceil(1 / r) + 1, nz = Math.ceil(D / r) + 1;
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
    near2: new Int32Array(n),
    around: new Float32Array(n),
    part: new Int32Array(n),
    owner: new Int32Array(n),
    hops: new Uint8Array(n),
    floor: lamp.params.wet > 0 ? floorOf(lamp.spacing, r) : null,
    f,
  };
  scratches.set(lamp, s);
  return s;
}

/** How finely `floorOf`'s tables go from the floor to the reach. */
const BINS = 64;

type Floor = { rho: Float32Array; near: Float32Array; up: Float32Array; up2: Float32Array; bin: number };

/**
 * A wetted floor: what a particle at each height, from the floor to the reach, gathers from wax
 * mirrored below the floor, a lattice of it at the spacing the wax rests at, averaged over where the
 * lattice lies across: its density (Σq², and Σq³ up close), and how it lies below (Σq·cos and Σq²·cos
 * of the angle from straight down), which a particle's skin normal and the density relaxation take
 * as they would wax.
 */
function floorOf(spacing: number, reach: number): Floor {
  const tables = { rho: new Float32Array(BINS + 2), near: new Float32Array(BINS + 2), up: new Float32Array(BINS + 2), up2: new Float32Array(BINS + 2) };
  const across = 6, side = Math.ceil(reach / spacing) + 1;
  for (let b = 0; b <= BINS; b++) {
    const h = (b / BINS) * reach;
    let rho = 0, near = 0, up = 0, up2 = 0;
    for (let ox = 0; ox < across; ox++)
      for (let oz = 0; oz < across; oz++)
        for (let m = 0; h + (m + 0.5) * spacing < reach; m++) {
          const dy = h + (m + 0.5) * spacing;
          for (let a = -side; a <= side; a++)
            for (let c = -side; c <= side; c++) {
              const dx = (a + (ox + 0.5) / across) * spacing, dz = (c + (oz + 0.5) / across) * spacing;
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d >= reach) continue;
              const w = 1 - d / reach;
              rho += w * w;
              near += w * w * w;
              up += (w * dy) / d;
              up2 += (w * w * dy) / d;
            }
        }
    const k = across * across;
    tables.rho[b] = rho / k;
    tables.near[b] = near / k;
    tables.up[b] = up / k;
    tables.up2[b] = up2 / k;
  }
  return { ...tables, bin: BINS / reach };
}

/**
 * A table of `floorOf`'s at height `y`, between its bins; at the floor's own for a particle past it,
 * as one moved but not yet held to the walls is (read below it, the table gave NaN, and the lamp
 * went with it).
 */
function floorAt(table: Float32Array, bin: number, y: number): number {
  const at = Math.max(0, y) * bin;
  if (at >= BINS) return 0;
  const k = Math.floor(at), f = at - k;
  return table[k] + (table[k + 1] - table[k]) * f;
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
  // The pool, the largest blob, and the blobs lying on the floor: what touches the pool runs into it
  // sooner, and so do blobs on the floor into each other, so the floor's wax is one pool again.
  let pool = -1;
  const floored = new Set<number>();
  if (lamp.params.poolDrain !== 1 && touching.size) {
    const sizes = new Map<number, number>();
    let most = 0;
    const floor = FLOOR * lamp.spacing;
    for (let i = 0; i < n; i++) {
      const c = (sizes.get(body[i]) ?? 0) + 1;
      sizes.set(body[i], c);
      if (c > most) [most, pool] = [c, body[i]];
      if (lamp.y[i] < floor) floored.add(body[i]);
    }
  }
  for (const [key, pairs] of touching) {
    if (pairs < 3) continue;
    const [u, v] = key.split(",").map(Number);
    const soon = u === pool || v === pool || (floored.has(u) && floored.has(v));
    const time = (lamp.contact.get(key) ?? 0) + interval * (soon ? lamp.params.poolDrain : 1);
    if (time >= lamp.params.drain) joins.push([u, v]);
    else held.set(key, time);
  }
  lamp.contact = held;
  if (lamp.params.pinch > 0) pinchNecks(lamp, s, interval);
  if (lamp.params.settle !== 1) flooredOf(lamp);
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

/** Marks the particles of every blob lying on the floor (any of it within `FLOOR` spacings of it). */
function flooredOf(lamp: Lamp) {
  const { n, y, body, floored } = lamp;
  const floor = FLOOR * lamp.spacing, on = new Set<number>();
  for (let i = 0; i < n; i++) if (y[i] < floor) on.add(body[i]);
  for (let i = 0; i < n; i++) floored[i] = on.has(body[i]) ? 1 : 0;
}

/** How near the floor, in spacings, a blob lies on it. */
const FLOOR = 2;

/** Particles inside wax a part needs to count as one. */
const PART = 8;
/** The fewest particles a thread's piece needs to go off as a bead; fewer stay with their blob. */
const BEAD = 4;
/** How many links from a part the particles of a neck go with it; a thread's middle, further, parts on its own. */
const HOLD = 3;

/**
 * Necks parting: what the skin alone does too slowly at this resolution, a thread a particle or two
 * across never thinning further. A blob whose insides (particles with neighbours all round) fall into
 * two parts or more joined only by skin, or whose skin trails a thread further than `HOLD` links from
 * its insides, has a neck; held that long for `pinch` seconds, it parts. Each particle goes with the
 * part it's fewest links from, a thread's middle making blobs of its own (beads, once the skin rounds
 * them); the largest keeps the label.
 */
function pinchNecks(lamp: Lamp, s: Scratch, interval: number) {
  const { n, body } = lamp;
  const { a, b, q, count, near2, around, part, owner, hops } = s;
  const { inside } = lamp.params;
  near2.fill(0);
  for (let k = 0; k < count; k++) {
    const i = a[k], j = b[k];
    if (body[i] !== body[j]) continue;
    near2[i]++;
    near2[j]++;
  }
  // Averaged over each particle and its neighbours: one particle's count is too noisy to tell
  // deep wax from skin by.
  for (let i = 0; i < n; i++) around[i] = near2[i];
  for (let k = 0; k < count; k++) {
    const i = a[k], j = b[k];
    if (body[i] !== body[j]) continue;
    around[i] += near2[j];
    around[j] += near2[i];
  }
  for (let i = 0; i < n; i++) around[i] /= 1 + near2[i];
  // The insides' parts: particles inside wax, linked as a blob's are.
  for (let i = 0; i < n; i++) part[i] = i;
  const find = (i: number): number => {
    while (part[i] !== i) i = part[i] = part[part[i]];
    return i;
  };
  for (let k = 0; k < count; k++) {
    if (q[k] < 0.3) continue;
    const i = a[k], j = b[k];
    if (body[i] !== body[j] || around[i] < inside || around[j] < inside) continue;
    const ri = find(i), rj = find(j);
    if (ri !== rj) part[ri] = rj;
  }
  const size = new Map<number, number>();
  for (let i = 0; i < n; i++) if (around[i] >= inside) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  // Which part each particle is fewest links from, out to `HOLD` links.
  const FAR = 255;
  for (let i = 0; i < n; i++) {
    const deep = around[i] >= inside && (size.get(find(i)) ?? 0) >= PART;
    owner[i] = deep ? find(i) : -1;
    hops[i] = deep ? 0 : FAR;
  }
  for (let round = 0; round < HOLD; round++)
    for (let k = 0; k < count; k++) {
      if (q[k] < 0.3) continue;
      const i = a[k], j = b[k];
      if (body[i] !== body[j]) continue;
      if (hops[i] === round && hops[j] > round + 1) {
        hops[j] = round + 1;
        owner[j] = owner[i];
      } else if (hops[j] === round && hops[i] > round + 1) {
        hops[i] = round + 1;
        owner[i] = owner[j];
      }
    }
  // Each blob's necks: two parts or more, or a thread trailing past `HOLD`.
  const firstPart = new Map<number, number>();
  const necked = new Set<number>();
  const trailing = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (owner[i] < 0) continue;
    const seen = firstPart.get(body[i]);
    if (seen === undefined) firstPart.set(body[i], owner[i]);
    else if (seen !== owner[i]) necked.add(body[i]);
  }
  for (let i = 0; i < n; i++) if (owner[i] < 0 && firstPart.has(body[i])) trailing.add(body[i]);
  const thin = new Set([...necked, ...trailing]);
  const held = new Map<number, number>();
  const parting: number[] = [];
  for (const label of thin) {
    const time = (lamp.necks.get(label) ?? 0) + interval;
    if (time >= lamp.params.pinch) parting.push(label);
    else held.set(label, time);
  }
  lamp.necks = held;
  if (!parting.length) return;
  const parts = new Set(parting);
  // A thread's middle: its particles linked among themselves, a blob each.
  for (let i = 0; i < n; i++) if (parts.has(body[i]) && owner[i] < 0) part[i] = i;
  for (let k = 0; k < count; k++) {
    if (q[k] < 0.3) continue;
    const i = a[k], j = b[k];
    if (body[i] !== body[j] || !parts.has(body[i]) || owner[i] >= 0 || owner[j] >= 0) continue;
    const ri = find(i), rj = find(j);
    if (ri !== rj) part[ri] = rj;
  }
  // The pieces, keyed by the part or thread each particle goes with; the largest keeps its label.
  const pieceOf = (i: number) => (owner[i] >= 0 ? owner[i] : n + find(i));
  const pieces = new Map<number, Map<number, number>>();
  for (let i = 0; i < n; i++) {
    if (!parts.has(body[i])) continue;
    let of = pieces.get(body[i]);
    if (!of) pieces.set(body[i], (of = new Map()));
    const key = pieceOf(i);
    of.set(key, (of.get(key) ?? 0) + 1);
  }
  const labels = new Map<number, number>();
  for (const [label, of] of pieces) {
    let largest = -1, most = 0;
    for (const [key, c] of of) if (c > most) [largest, most] = [key, c];
    // A piece of thread too small to be a bead stays with the blob, which draws it back in.
    for (const [key, c] of of) labels.set(key, key === largest || (key >= n && c < BEAD) ? label : lamp.bodies++);
  }
  for (let i = 0; i < n; i++) if (parts.has(body[i])) body[i] = labels.get(pieceOf(i))!;
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

/**
 * The most Akinci's correction strengthens tension, as where two particles have a tenth of the wax's
 * density each: well past a thread a particle across (about five), so only strays are held to it.
 */
const THINNEST = 10;

/** Moves the lamp on a step. */
export function step(lamp: Lamp) {
  const p = lamp.params;
  const { n, x, y, z, vx, vy, vz, t, full, reach, rest, body } = lamp;
  const dt = p.dt, W = p.width, D = p.depth, sp = lamp.spacing;
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
  // A floor and sides that hold wax as wax would: full against them, and no skin there.
  const floor = s.floor;
  if (floor)
    for (let i = 0; i < n; i++) {
      if (y[i] * floor.bin < BINS) rho[i] += floorAt(floor.rho, floor.bin, y[i]);
      if (x[i] * floor.bin < BINS) rho[i] += floorAt(floor.rho, floor.bin, x[i]);
      if ((W - x[i]) * floor.bin < BINS) rho[i] += floorAt(floor.rho, floor.bin, W - x[i]);
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
    if (floor)
      for (let i = 0; i < n; i++) {
        if (y[i] * floor.bin < BINS) nY[i] -= floorAt(floor.up, floor.bin, y[i]);
        if (x[i] * floor.bin < BINS) nX[i] -= floorAt(floor.up, floor.bin, x[i]);
        if ((W - x[i]) * floor.bin < BINS) nX[i] += floorAt(floor.up, floor.bin, W - x[i]);
      }
    const f = 1 / lamp.flat;
    for (let i = 0; i < n; i++) { nX[i] *= f; nY[i] *= f; nZ[i] *= f; }
    const g = p.tension;
    for (let k = 0; k < count; k++) {
      const i = a[k], j = b[k], w = q[k];
      if (body[i] !== body[j]) continue;
      const r = 1 - w, d = r * reach;
      if (d < 1e-9) continue;
      // Akinci's correction, stronger where the skin is thin; held to `THINNEST`, or two particles of a
      // blob nearly alone (a thread's last link) had none round them to divide by and flew apart.
      const K = Math.min(THINNEST, (2 * rest) / (rho[i] + rho[j] + 1e-9));
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
  const cz = D / 2, coils = p.coils, reachOf = p.coil * p.coil;
  const flow = p.currents > 0, fresh = lamp.steps % 4 === 0;
  for (let i = 0; i < n; i++) {
    full[i] = Math.min(1, rho[i] / rest);
    const skin = 1 - full[i];
    // Heat: what neighbours share, what the liquid takes (most at the skin), what the coil gives.
    let rate = (p.share * heat[i]) / (1 + wv[i]) + (p.cool + p.skinCool * skin * skin) * (liquidAt(p, y[i]) - t[i]);
    if (y[i] < p.coilHeight && t[i] < p.hottest) {
      const dz = z[i] - cz;
      for (let c = 0; c < coils.length; c++) {
        const dx = x[i] - coils[c];
        const r2 = (dx * dx + dz * dz) / reachOf;
        if (r2 < 1) rate += p.heat * (1 - r2);
      }
    }
    t[i] += rate * dt;
    // Lift by the warmth of the wax round it, in proportion, up to `most`.
    const warmth = (ts[i] / tw[i] - p.crossover) / p.spread;
    const lift = Math.max(-p.most, Math.min(p.most, warmth));
    vy[i] += p.lift * (lift < 0 && lamp.floored[i] ? p.settle : 1) * lift * dt;
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
  if (floor) {
    const by = (i: number, h: number) => {
      if (h * floor.bin >= BINS) return;
      rho[i] += floorAt(floor.rho, floor.bin, h);
      near[i] += floorAt(floor.near, floor.bin, h);
    };
    for (let i = 0; i < n; i++) {
      by(i, y[i]);
      by(i, x[i]);
      by(i, W - x[i]);
    }
  }
  for (let i = 0; i < n; i++) {
    rho[i] = (p.stiff * (rho[i] - rest)) / rest;
    near[i] = (p.stiff * p.near * near[i]) / rest;
  }
  // The floor's and sides' wax, at rest itself, pressing on those by it where they crowd it, as wax
  // does; never holding them to it (that left a film of lone particles behind wherever the pool drew
  // back).
  if (floor)
    for (let i = 0; i < n; i++) {
      const push = (h: number) => (h * floor.bin >= BINS ? 0 : 0.5 * sp * (Math.max(0, rho[i]) * floorAt(floor.up, floor.bin, h) + 2 * near[i] * floorAt(floor.up2, floor.bin, h)));
      my[i] += push(y[i]);
      mx[i] += push(x[i]) - push(W - x[i]);
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
    const zi = Math.min(D - pad, Math.max(pad, z[i] + mz[i]));
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
