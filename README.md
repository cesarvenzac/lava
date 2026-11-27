# @cesarvenzac/lava

A lava lamp for any box, simulated. Its wax is thousands of particles in 3D, heated by a coil under
the floor: warm wax rises from the pool as a plume on a stem whose neck thins and breaks, blobs
gather and press together under the top, cool and sink back to rest on the pool, the liquid carrying
them on slow currents of its own. Tuned to footage of real lamps and measured the way it was: the
wax rises, sinks and drifts at a real lamp's speeds. Drawn glowing in a dark liquid, shot through a
long lens with a shallow focus, its light blooming, then graded as film. WebGL 2 and a worker, with
no dependencies.

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

<Lava palette="magenta" style={{ width: 240, height: 600 }} />;
```

The element is the lamp: give it a size, and the wax fills it, laid under the element's own
content. The lamp is two and a half times as tall as it's wide: a box that shape or taller shows
all of it; a wider one shows a band of it, as a picture fills a box with `object-fit: cover`, and
`place` chooses which, from the pool (0) to the top (1). A lamp on its own is a picture, named by
`label`; with content inside, it's that content's background and says nothing itself.

## What it does

- **Simulated wax.** Each particle has its own temperature. Wax is a little heavier than the liquid
  when cool and a little lighter when warm, and lifts in proportion. Its skin has surface tension,
  so blobs round off and a stretched neck thins and breaks. Blobs that meet press together, dented
  flat where they touch, and slide past each other; only after half a minute pressed together, as
  the liquid between real blobs takes to drain, do they run into one. Heat spreads slowly through
  the wax, as it does in real wax.
- **Two lamps.** `mood`: `busy` (the default), a hotter lamp, a stem often reaching the top and
  feeding what gathers there; or `calm`, one plume at a time. Each starts from a lamp already
  running, so there's no waiting for it to warm up. (One thing isn't a real lamp's: the coil's heat
  swells and fades over a minute or so. Held steady, the simulation settles after a minute or two
  into a column standing over the coil.)
- **In a worker.** The simulation runs off the page, started from its own source, so nothing has to
  be set up to load it; where a page's security policy refuses that, it runs in the page a few
  milliseconds at a time. It runs at the lamp's own pace (`speed`), or as near as the device allows:
  `rate` says how near.
- **Lit from the bulb.** Each point of wax is lit by what reaches it through the wax beneath, so
  undersides glow and tops fall into shade. Thin wax glows toward the hot colour, wax fresh off the
  coil glows of itself (`heat`), creases where wax meets wax are shaded, and a satin skin catches
  the lit liquid at its rim.
- **A lens.** Wax in front of and behind the focus blurs, as a macro lens draws it (`aperture`,
  `focus`); wax further back sinks into the liquid's own light (`haze`). The brightest light
  blooms, and the picture goes through a filmic tone curve, a vignette and a fine grain.
- **Five palettes.** `palette`: `amber` (the default), `magenta`, `ember`, `acid` or `violet`, each a
  wax on a dark liquid. Or any colours of your own, CSS colours, `var(--…)` included:
  `colours: { wax, hot, liquid, light }`.
- **Well behaved.** It runs only while it's on screen and the tab is shown, and holds still under
  reduced motion. It's drawn at up to `maxPixels` and scaled up, and drawn smaller, early and at
  most twice, if frames come slowly. Its shaders are compiled without holding up the page. Until
  the wax is drawn, and wherever a browser can't draw it, the element shows the liquid lit from
  below; React's server draws that too.

## API

```ts
function lava(element: HTMLElement, options?: LavaOptions): Lava;

type Lava = {
  readonly element: HTMLElement;
  readonly time: number; // seconds of the lamp's own time
  readonly rate: number; // its seconds a real second, lately
  readonly drawing: boolean;
  set(options: LavaOptions): void;
  play(): void;
  pause(): void;
  destroy(): void;
};
```

`LavaOptions`, each with its default: `palette` (`"amber"`), `colours`, `mood` (`"busy"`), `speed`
(1), `place` (0.5), `glow` (1), `bloom` (1), `gloss` (1), `exposure` (1), `aperture` (1), `focus`
(0), `haze` (1), `heat` (1), `grain` (1), `label`, `reducedMotion` (the system's), `maxPixels`
(800,000), `paused` (false).

`PALETTES` holds the five, `PALETTE_NAMES` their names, and `standInOf(colours)` the CSS
background shown until the wax is drawn, for a server of your own.

React's `Lava` takes every option as a prop, `handle` for the `Lava` made, children to draw over
it, and the rest as the `<div>`'s.

Each option, with examples: [cesarvenzac.com/lava/docs/api](https://cesarvenzac.com/lava/docs/api).

## Licence

MIT
