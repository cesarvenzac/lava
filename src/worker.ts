/**
 * The lamp's worker: the loop (loop.ts) run off the page, each field sent back with its buffers
 * handed over rather than copied. Bundled into a string (worker-code.ts, by scripts/worker.mjs) that
 * the page starts from a blob, so nothing has to be set up to load it.
 */

import { loopOf, type Message } from "./loop.ts";

const scope = self as unknown as { onmessage: ((event: MessageEvent<Message>) => void) | null; postMessage(message: unknown, transfer: Transferable[]): void };
const loop = loopOf((sent) => scope.postMessage(sent, [sent.wax.buffer, sent.heat.buffer]));
scope.onmessage = (event) => loop.handle(event.data);
