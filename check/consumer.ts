// The package as someone installing it uses it: typechecked against its published types (as
// NodeNext and as a bundler resolves them) and run, by check/run.sh. `lava` needs a page, so here
// it's typechecked only; the React component renders on a server.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { type Colours, lava, type Lava, type LavaOptions, PALETTE_NAMES, PALETTES, type PaletteName, standInOf } from "@cesarvenzac/lava";
import { Lava as LavaComponent, type LavaProps } from "@cesarvenzac/lava/react";

const palette: PaletteName = "magenta";
const colours: Partial<Colours> = { wax: "var(--brand)", liquid: "#111" };
const options: LavaOptions = { palette, colours, seed: "hero", speed: 1.2, count: 7, size: 1.1, pool: 0.15, wobble: 0.8, glow: 1.2, bloom: 0.8, gloss: 1, exposure: 1.1, aperture: 0.6, focus: 0.1, haze: 1.2, grain: 0.5, label: "A lamp", reducedMotion: false, start: 12, maxPixels: 600_000, paused: false };
export const start = (element: HTMLElement): Lava => {
  const made = lava(element, options);
  made.set({ palette: "acid" });
  made.seek(40);
  made.pause();
  made.play();
  const time: number = made.time;
  const drawing: boolean = made.drawing;
  void time;
  void drawing;
  return made;
};
if (typeof lava !== "function") throw new Error("lava isn't a function");
if (PALETTE_NAMES.length !== 5 || !PALETTES.amber.wax) throw new Error("five palettes");
if (!standInOf(PALETTES.amber).includes(PALETTES.amber.liquid)) throw new Error("the stand-in has no liquid");

const props: LavaProps = { palette: "violet", label: "A violet lamp", className: "lamp" };
const markup = renderToStaticMarkup(createElement(LavaComponent, props));
if (!markup.includes(`class="lamp"`) || !markup.includes(`aria-label="A violet lamp"`) || !markup.includes(PALETTES.violet.liquid)) throw new Error("Lava didn't draw its stand-in for the server");

console.log(`${PALETTE_NAMES.join(", ")}; ${markup.length} characters drawn on a server`);
