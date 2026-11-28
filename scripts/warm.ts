// Makes the lamps' warm starts (src/warm/): each mood's lamp, and its widest box tank (what a box's
// tank is cut from), run for two minutes from a cold pool, then kept as warm.ts packs it, gzipped and
// written as base64, a module each so a page loads only the one it starts from. Run with Node after
// changing what the lamps do: npm run warm (some minutes; `-- lamp` or `-- box` for one kind alone,
// and a mood after it for one mood).
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { lampOf, MOODS, type Mood, type Params, step, tankOf, WIDEST } from "../src/sim.ts";
import { pack } from "../src/warm.ts";

const SECONDS = 120;
const [only, mood] = process.argv.slice(2);

function keep(name: string, what: string, params: Params) {
  const lamp = lampOf(params);
  while (lamp.time < SECONDS) step(lamp);
  const packed = gzipSync(pack(lamp), { level: 9 }).toString("base64");
  writeFileSync(
    new URL(`../src/warm/${name}.ts`, import.meta.url),
    `// Made by scripts/warm.ts: don't edit by hand.\n\n/** ${what}, packed by warm.ts, gzipped, as base64. */\nexport const WARM = ${JSON.stringify(packed)};\n`,
  );
  console.log(`${name}: ${lamp.n} particles at ${lamp.time.toFixed(0)} s, ${(packed.length / 1024).toFixed(0)} KB`);
}

for (const each of Object.keys(MOODS) as Mood[]) {
  if (mood && mood !== each) continue;
  if (only !== "box") keep(`lamp-${each}`, `The ${each} lamp two minutes in`, MOODS[each]);
  if (only !== "lamp") keep(`box-${each}`, `The ${each} widest box tank two minutes in, what a box's tank is cut from`, tankOf(each, WIDEST));
}
