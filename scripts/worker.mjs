// Bundles the lamp's worker (src/worker.ts and what it imports) into one script and keeps it as a
// string in src/worker-code.ts, which the page starts as a blob: whoever installs the package sets
// nothing up to load it. Run after changing what the worker runs: npm run worker. A test checks the
// string is up to date.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export async function workerSource() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/worker.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    minify: true,
    target: "es2022",
    write: false,
    legalComments: "none",
  });
  return result.outputFiles[0].text;
}

export function moduleOf(source) {
  return `// Made by scripts/worker.mjs from src/worker.ts: don't edit by hand.\n\n/** The lamp's worker, bundled: started as a blob by runner.ts. */\nexport const WORKER = ${JSON.stringify(source)};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = await workerSource();
  writeFileSync(fileURLToPath(new URL("../src/worker-code.ts", import.meta.url)), moduleOf(source));
  console.log(`worker: ${(source.length / 1024).toFixed(1)} KB`);
}
