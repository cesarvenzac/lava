/**
 * Where the lamp runs: in a worker started from its bundled source (worker-code.ts), so the page
 * stays free; or, where a page's security policy refuses workers made from blobs, in the page itself,
 * a few milliseconds at a time, slower but still going.
 */

import { loopOf, type Message, type Sent, type View } from "./loop.ts";
import type { Mood } from "./sim.ts";
import { WARM } from "./warm-data.ts";
import { WORKER } from "./worker-code.ts";

export type Runner = {
  start(mood: Mood, speed: number, running: boolean, view: View): void;
  set(change: { speed?: number; running?: boolean; view?: View }): void;
  destroy(): void;
};

/** A runner sending each field to `receive`. */
export function runnerOf(receive: (sent: Sent) => void): Runner {
  let worker: Worker | null = null;
  let url = "";
  let inPage: ReturnType<typeof loopOf> | null = null;
  let last: Message | null = null;
  let heard = false;

  const inPageFallback = () => {
    worker?.terminate();
    worker = null;
    if (inPage) return;
    // A few milliseconds a turn: the page keeps its frames, and the lamp runs as fast as that allows.
    inPage = loopOf(receive, 6);
    if (last) inPage.handle(last);
  };
  try {
    url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = (event: MessageEvent<Sent>) => {
      heard = true;
      receive(event.data);
    };
    // Refused (a policy against blob workers is reported as an error, not thrown): run in the page.
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (!heard) inPageFallback();
    };
  } catch {
    inPageFallback();
  }
  const send = (message: Message) => {
    if (inPage) inPage.handle(message);
    else worker?.postMessage(message);
  };

  return {
    start(mood, speed, running, view) {
      last = { type: "start", mood, warm: WARM[mood] ?? null, speed, running, view };
      send(last);
    },
    set(change) {
      if (last && last.type === "start") last = { ...last, ...change };
      send({ type: "set", ...change });
    },
    destroy() {
      worker?.terminate();
      inPage?.stop();
      if (url) URL.revokeObjectURL(url);
    },
  };
}
