/**
 * A lava lamp for any box: thick 3D wax glowing in a dark liquid, drawing necks out of a pool on
 * the bulb and parting slowly, shot through a long lens with a shallow focus, bloom and a filmic
 * grade.
 *
 *   import { lava } from "@cesarvenzac/lava";
 *
 *   lava(document.querySelector(".hero"), { palette: "magenta" });
 *
 * The React component is `@cesarvenzac/lava/react`.
 */

export { type Lava, lava } from "./lava.ts";
export { type LavaOptions } from "./options.ts";
export { type Colours, PALETTE_NAMES, PALETTES, type PaletteName, standInOf } from "./palettes.ts";
