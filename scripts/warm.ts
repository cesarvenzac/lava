// Makes the lamps' warm starts (src/warm-data.ts): each mood run for two minutes from a cold pool,
// then kept as warm.ts packs it, gzipped and written as base64. Run with Node after changing what the
// lamps do: npm run warm (a few minutes).
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { lampOf, MOODS, type Mood, step } from "../src/sim.ts";
import { pack } from "../src/warm.ts";

const SECONDS = 120;
const out: Record<string, string> = {};
for (const mood of Object.keys(MOODS) as Mood[]) {
  const lamp = lampOf(MOODS[mood]);
  while (lamp.time < SECONDS) step(lamp);
  out[mood] = gzipSync(pack(lamp), { level: 9 }).toString("base64");
  console.log(`${mood}: ${lamp.n} particles at ${lamp.time.toFixed(0)} s, ${(out[mood].length / 1024).toFixed(0)} KB`);
}
writeFileSync(
  new URL("../src/warm-data.ts", import.meta.url),
  `// Made by scripts/warm.ts: don't edit by hand.\n\n/** Each mood's lamp two minutes in, packed by warm.ts, gzipped, as base64. */\nexport const WARM: Record<string, string> = ${JSON.stringify(out, null, 2)};\n`,
);
