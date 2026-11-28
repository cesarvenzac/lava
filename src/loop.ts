/**
 * The lamp kept running: steps taken as real time passes (times `speed`), never more than a few at
 * once, so a slow machine runs the lamp slower rather than stutter; and every `EVERY` seconds of the
 * lamp's own time, what's drawn of it (its wax as a field, a cut through its middle, or its particles
 * as they are), handed on
 * with the lamp's time and how many of its seconds passed in each real one lately. Run in a worker
 * (worker.ts), or in the page where workers are refused (runner.ts).
 */

import { dimsOf, type Field, fieldOf, sectionDimsOf } from "./field.ts";
import { type Lamp, lampOf, type Mood, step, tankOf } from "./sim.ts";
import { cutLamp, unpackLamp, unzip } from "./warm.ts";

/** How often what's drawn is sent, in the lamp's seconds. */
export const EVERY = 1 / 20;

/**
 * What a lamp is drawn as: its wax; a clean cut through its middle; or its particles, each blob in a
 * colour of its own or each particle by its warmth.
 */
export type View = "wax" | "section" | "blobs" | "warmth";

/** The tank: the lamp's own, or a box's, this many times as wide as it's tall. */
export type Tank = "lamp" | { aspect: number };

/** How many colours the blobs are drawn in: the pool's, then one for each blob in turn. */
export const BLOB_COLOURS = 48;

/**
 * The particles as they are: positions (x, y, z for each, in the lamp's units), the colour each is
 * drawn in (0 for the largest blob, the pool; another for each other blob, by its label), and its
 * warmth, 20 to 70 degrees as 0 to 255.
 */
export type Particles = { positions: Float32Array; colour: Uint8Array; warmth: Uint8Array };

export type Start = { type: "start"; mood: Mood; tank: Tank; warm: string | null; speed: number; running: boolean; view: View };
export type Change = { type: "set"; speed?: number; running?: boolean; view?: View };
export type Message = Start | Change;
export type Sent = (({ kind: "field" } & Field) | ({ kind: "section" } & Field) | ({ kind: "particles" } & Particles)) & { time: number; rate: number };

/** What a view is sent as. */
export const kindOf = (view: View): Sent["kind"] => (view === "wax" ? "field" : view === "section" ? "section" : "particles");

/** A tank's params. */
export const paramsOf = (mood: Mood, tank: Tank) => tankOf(mood, tank === "lamp" ? "lamp" : tank.aspect);

/** The particles of a lamp, to be drawn. */
export function particlesOf(lamp: Lamp): Particles {
  const { n, x, y, z, t, body } = lamp;
  const positions = new Float32Array(3 * n);
  const colour = new Uint8Array(n);
  const warmth = new Uint8Array(n);
  const counts = new Map<number, number>();
  let pool = body[0], most = 0;
  for (let i = 0; i < n; i++) {
    const c = (counts.get(body[i]) ?? 0) + 1;
    counts.set(body[i], c);
    if (c > most) {
      most = c;
      pool = body[i];
    }
  }
  for (let i = 0; i < n; i++) {
    positions[3 * i] = x[i];
    positions[3 * i + 1] = y[i];
    positions[3 * i + 2] = z[i];
    colour[i] = body[i] === pool ? 0 : 1 + (body[i] % (BLOB_COLOURS - 1));
    warmth[i] = Math.max(0, Math.min(255, Math.round(((t[i] - 20) / 50) * 255)));
  }
  return { positions, colour, warmth };
}

export type Loop = { handle(message: Message): void; stop(): void };

/**
 * A loop: `send` gets each field; `later(fn, ms)` schedules its next turn (setTimeout in a worker);
 * `budget` is the most milliseconds a turn may step for before it lets the page (or the worker's
 * messages) in.
 */
export function loopOf(send: (sent: Sent) => void, budget = 30): Loop {
  let lamp: Lamp | null = null;
  let speed = 1, running = true, stopped = false, scheduled = false;
  let view: View = "wax";
  let owed = 0, last = 0, next = 0, generation = 0;
  const recent: [number, number][] = [];

  const post = () => {
    if (!lamp) return;
    const now = performance.now();
    recent.push([now, lamp.time]);
    while (recent.length > 2 && now - recent[0][0] > 3000) recent.shift();
    const [t0, s0] = recent[0];
    const said = { time: lamp.time, rate: now > t0 ? ((lamp.time - s0) * 1000) / (now - t0) : speed };
    const kind = kindOf(view);
    if (kind === "particles") send({ kind, ...particlesOf(lamp), ...said });
    else if (kind === "section") send({ kind, ...fieldOf(lamp, sectionDimsOf(lamp.params)), ...said });
    else send({ kind, ...fieldOf(lamp, dimsOf(lamp.params)), ...said });
  };

  const turn = () => {
    scheduled = false;
    if (!lamp || stopped || !running) return;
    const now = performance.now();
    const dt = lamp.params.dt;
    owed += Math.min(0.25, ((now - last) / 1000) * speed);
    last = now;
    const start = performance.now();
    while (owed >= dt && performance.now() - start < budget) {
      step(lamp);
      owed -= dt;
      if (lamp.time >= next) {
        post();
        next = lamp.time + EVERY;
      }
    }
    if (owed > 4 * dt) owed = 4 * dt;
    schedule(owed >= dt ? 0 : 4);
  };
  const schedule = (ms: number) => {
    if (scheduled || stopped) return;
    scheduled = true;
    setTimeout(turn, ms);
  };

  return {
    handle(message) {
      if (message.type === "start") {
        const made = ++generation;
        speed = message.speed;
        running = message.running;
        view = message.view;
        const params = paramsOf(message.mood, message.tank);
        const fromWarm = (bytes: Uint8Array) => (message.tank === "lamp" ? unpackLamp(params, bytes) : cutLamp(params, bytes));
        const begin = (made2: Lamp) => {
          if (made !== generation || stopped) return;
          lamp = made2;
          recent.length = 0;
          owed = 0;
          last = performance.now();
          next = lamp.time + EVERY;
          post();
          if (running) schedule(0);
        };
        // A warm start, or (where it can't be read) a cold pool, which takes some minutes to warm.
        if (message.warm) unzip(message.warm).then((bytes) => begin(fromWarm(bytes)), () => begin(lampOf(params)));
        else begin(lampOf(params));
        return;
      }
      if (message.speed !== undefined) speed = Math.max(0, message.speed);
      if (message.view !== undefined && message.view !== view) {
        // Drawn another way: what's drawn now, at once, whether it's running or not.
        view = message.view;
        post();
      }
      if (message.running !== undefined && message.running !== running) {
        running = message.running;
        last = performance.now();
        recent.length = 0;
        if (running) schedule(0);
      }
    },
    stop() {
      stopped = true;
    },
  };
}
