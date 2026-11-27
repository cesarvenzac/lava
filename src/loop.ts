/**
 * The lamp kept running: steps taken as real time passes (times `speed`), never more than a few at
 * once, so a slow machine runs the lamp slower rather than stutter; and every `EVERY` seconds of the
 * lamp's own time, its wax as a field, handed on with the lamp's time and how many of its seconds
 * passed in each real one lately. Run in a worker (worker.ts), or in the page where workers are
 * refused (runner.ts).
 */

import { type Field, fieldOf } from "./field.ts";
import { type Lamp, lampOf, MOODS, type Mood, step } from "./sim.ts";
import { unpackLamp, unzip } from "./warm.ts";

/** How often a field is sent, in the lamp's seconds. */
export const EVERY = 1 / 20;

export type Start = { type: "start"; mood: Mood; warm: string | null; speed: number; running: boolean };
export type Change = { type: "set"; speed?: number; running?: boolean };
export type Message = Start | Change;
export type Sent = Field & { time: number; rate: number };

export type Loop = { handle(message: Message): void; stop(): void };

/**
 * A loop: `send` gets each field; `later(fn, ms)` schedules its next turn (setTimeout in a worker);
 * `budget` is the most milliseconds a turn may step for before it lets the page (or the worker's
 * messages) in.
 */
export function loopOf(send: (sent: Sent) => void, budget = 30): Loop {
  let lamp: Lamp | null = null;
  let speed = 1, running = true, stopped = false, scheduled = false;
  let owed = 0, last = 0, next = 0, generation = 0;
  const recent: [number, number][] = [];

  const post = () => {
    if (!lamp) return;
    const field = fieldOf(lamp);
    const now = performance.now();
    recent.push([now, lamp.time]);
    while (recent.length > 2 && now - recent[0][0] > 3000) recent.shift();
    const [t0, s0] = recent[0];
    send({ ...field, time: lamp.time, rate: now > t0 ? ((lamp.time - s0) * 1000) / (now - t0) : speed });
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
        const params = MOODS[message.mood] ?? MOODS.busy;
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
        if (message.warm) unzip(message.warm).then((bytes) => begin(unpackLamp(params, bytes)), () => begin(lampOf(params)));
        else begin(lampOf(params));
        return;
      }
      if (message.speed !== undefined) speed = Math.max(0, message.speed);
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
