/**
 * A lava lamp for any box, simulated: thousands of particles of wax in 3D, heated by a coil, rising,
 * pressing together under the top and sinking back as a real lamp's do, glowing in a dark liquid,
 * shot through a long lens with a shallow focus, bloom and a filmic grade.
 *
 *   import { lava } from "@cesarvenzac/lava";
 *
 *   lava(document.querySelector(".hero"), { palette: "magenta", mood: "calm" });
 *
 * The React component is `@cesarvenzac/lava/react`.
 */

export { type Lava, lava } from "./lava.ts";
export { type View } from "./loop.ts";
export { type LavaOptions } from "./options.ts";
export { type Mood } from "./sim.ts";
export { type Colours, PALETTE_NAMES, PALETTES, type PaletteName, standInOf } from "./palettes.ts";
