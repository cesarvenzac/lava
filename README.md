# @cesarvenzac/lava

A lava lamp for any box. Thick wax glowing in a dark liquid: it rises from a pool lying on the
bulb, draws a neck out of it that thins and parts, drifts up as the bulb's light leaves it, and
sinks back to settle in the pool. Real 3D wax, lit from below, shot through a long lens with a
shallow focus, its light blooming, then graded as film. One WebGL 2 render, seeded, with no
dependencies.

The docs, with live examples, are at [cesarvenzac.com/lava](https://cesarvenzac.com/lava).

```sh
npm install @cesarvenzac/lava
```

## Use

```ts
import { lava } from "@cesarvenzac/lava";

const lamp = lava(document.querySelector(".hero")!, { palette: "magenta" });
```

In React:

```tsx
import { Lava } from "@cesarvenzac/lava/react";

<Lava palette="magenta" style={{ height: 480 }} />;
```

The element is the lamp: give it a size, and the wax fills it, laid under the element's own
content. A lamp on its own is a picture, named by `label`; with content inside, it's that
content's background and says nothing itself.

## What it does

- **Thick wax.** Blobs climb out of the pool and sink back on slow cycles, none keeping time with
  another. Rising, a blob draws a thick neck out of the pool, which heaves up under it; the neck
  thins to a waist and parts while still thick, its upper half drawn up into the blob and its
  lower half slumping back. Nothing bounces or rings: freed, a blob eases from stretched to
  round. Sinking, it flattens as it presses into the pool.
- **Real 3D.** Each blob is solid, an ellipsoid stretched along its climb with a lobe trailing it,
  run together with the others only where they touch. Blobs pass in front of and behind each
  other.
- **Lit from the bulb.** Each point of wax is lit by what reaches it through the wax beneath, so
  undersides glow and tops fall into shade. Thin wax and edges glow toward the hot colour, deep
  wax keeps the saturated one, creases where wax meets wax are shaded, and a soft key light
  leaves a glossy highlight.
- **A lens.** Wax in front of and behind the focus blurs, as a macro lens draws it (`aperture`,
  `focus`); wax further back sinks into the liquid's own light (`haze`). The brightest light
  blooms, and the picture goes through a filmic tone curve, a vignette and a fine grain.
- **Five lamps.** `palette`: `amber` (the default), `magenta`, `ember`, `acid` or `violet`, each a
  wax on a dark liquid. Or any colours of your own, CSS colours, `var(--…)` included:
  `colours: { wax, hot, liquid, light }`.
- **Seeded.** The same `seed` lays out the same lamp, and every moment is worked out from the time
  alone, so any one can be drawn on its own (`seek`).
- **Any box.** Sizes follow the box's shorter side and the number of blobs its shape, so a banner,
  a card and a tall column each get a lamp in proportion.
- **Well behaved.** It moves only while it's on screen and the tab is shown, and holds still under
  reduced motion. It's drawn at up to `maxPixels` and scaled up, and drawn smaller, early and at
  most twice, if frames come slowly. Its shaders are compiled without holding up the page. Until
  the wax is drawn, and wherever a browser can't draw it, the element shows the liquid lit from
  below; React's server draws that too.

## API

```ts
function lava(element: HTMLElement, options?: LavaOptions): Lava;

type Lava = {
  readonly element: HTMLElement;
  readonly time: number; // seconds into its motion
  readonly drawing: boolean;
  set(options: LavaOptions): void;
  play(): void;
  pause(): void;
  seek(time: number): void;
  destroy(): void;
};
```

`LavaOptions`, each with its default: `palette` (`"amber"`), `colours`, `seed` (`"lava"`), `speed`
(1), `count` (from the box), `size` (1), `pool` (0.12), `wobble` (1), `glow` (1), `bloom` (1),
`gloss` (1), `exposure` (1), `aperture` (1), `focus` (0), `haze` (1), `grain` (1), `label`,
`reducedMotion` (the system's), `start` (30), `maxPixels` (800,000), `paused` (false).

`PALETTES` holds the five, `PALETTE_NAMES` their names, and `standInOf(colours)` the CSS
background shown until the wax is drawn, for a server of your own.

React's `Lava` takes every option as a prop, `handle` for the `Lava` made, children to draw over
it, and the rest as the `<div>`'s.

Each option, with examples: [cesarvenzac.com/lava/docs/api](https://cesarvenzac.com/lava/docs/api).

## Licence

MIT
