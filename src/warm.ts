/**
 * A lamp kept mid-run, for a page to start from rather than a cold pool that takes minutes to warm:
 * its particles' positions and warmth as 16-bit numbers and their blobs' labels, velocities left out
 * (the lamp starts still and is moving again within a second). About ten bytes a particle before it's
 * gzipped.
 *
 * Pure: no DOM (`unpack` needs a DecompressionStream, which browsers and Node both have).
 */

import { type Lamp, lampOf, type Params } from "./sim.ts";

const HEADER = 12;
const HOTTEST = 80;
const COOLEST = 20;

/** A lamp as bytes. */
export function pack(lamp: Lamp): Uint8Array {
  const { n } = lamp;
  const bytes = new Uint8Array(HEADER + n * 10);
  const view = new DataView(bytes.buffer);
  // The blobs' labels, made small: the first seen is 0, the next 1, and so on.
  const labels = new Map<number, number>();
  for (let i = 0; i < n; i++) if (!labels.has(lamp.body[i])) labels.set(lamp.body[i], labels.size);
  view.setUint32(0, n, true);
  view.setFloat32(4, lamp.time, true);
  view.setUint32(8, labels.size, true);
  const W = lamp.params.width;
  const u16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v * 65535)));
  for (let i = 0; i < n; i++) {
    const at = HEADER + i * 10;
    view.setUint16(at, u16(lamp.x[i] / W), true);
    view.setUint16(at + 2, u16(lamp.y[i]), true);
    view.setUint16(at + 4, u16(lamp.z[i] / W), true);
    view.setUint16(at + 6, u16((lamp.t[i] - COOLEST) / (HOTTEST - COOLEST)), true);
    view.setUint16(at + 8, labels.get(lamp.body[i])!, true);
  }
  return bytes;
}

/** A lamp from bytes `pack` wrote, run on these params. */
export function unpackLamp(params: Params, bytes: Uint8Array): Lamp {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(0, true);
  const lamp = lampOf(params, false);
  if (lamp.n !== n) throw new Error(`lava: a warm start of ${n} particles for a lamp of ${lamp.n}`);
  lamp.time = view.getFloat32(4, true);
  lamp.bodies = view.getUint32(8, true);
  const W = params.width;
  for (let i = 0; i < n; i++) {
    const at = HEADER + i * 10;
    lamp.x[i] = (view.getUint16(at, true) / 65535) * W;
    lamp.y[i] = view.getUint16(at + 2, true) / 65535;
    lamp.z[i] = (view.getUint16(at + 4, true) / 65535) * W;
    lamp.t[i] = COOLEST + (view.getUint16(at + 6, true) / 65535) * (HOTTEST - COOLEST);
    lamp.body[i] = view.getUint16(at + 8, true);
  }
  return lamp;
}

/** Base64 of gzipped bytes, as the warm starts are kept, back to the bytes. */
export async function unzip(base64: string): Promise<Uint8Array> {
  const binary = atob(base64);
  const zipped = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) zipped[i] = binary.charCodeAt(i);
  const stream = new Blob([zipped]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
