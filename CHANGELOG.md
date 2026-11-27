# Changelog

## 0.3.0

The simulation can be seen as it runs.

- `view`: `wax` (the default), the lamp as it looks; `blobs`, its particles seen from the side, each blob in a colour of its own; or `warmth`, each particle by how warm it is. Colours come from the palette.
- `snapshot()`: a picture of the next frame drawn, as an `ImageBitmap`, in any view, paused or not.

## 0.2.0

The lamp is simulated now, its wax thousands of particles in 3D, tuned to footage of real lamps.

- Warm wax rises from the pool as a plume on a stem whose neck thins and breaks; blobs gather and press together under the top, dented where they meet, and run into one only after half a minute touching; cooled, they sink and rest on the pool before joining it. The liquid carries the wax on slow currents of its own. Measured as the footage was, it rises, sinks and drifts at a real lamp's speeds.
- `mood`: `busy` (the default) or `calm`. Each starts from a lamp already running.
- The simulation runs in a worker started from its own source, with nothing to set up; where a page refuses that, in the page itself. `rate` says how near its own pace the device keeps it.
- The lamp is two and a half times as tall as it's wide: a box that shape or taller shows all of it, a wider one a band of it, which `place` chooses.
- `heat` is how much the wax's warmth colours it, now 1 by default.
- Breaking: `seed`, `count`, `size`, `pool`, `wobble`, `start` and `seek()` are gone, with the scripted motion they set; `speed` goes up to 3.

## 0.1.0

The first version.

- `lava(element)` and React's `<Lava>`: a lava lamp filling any box, laid under the element's own content.
- Thick wax: blobs climbing out of a pool on the bulb and sinking back, each drawing a thick neck out of the pool that thins to a waist and parts, its halves drawn back into the blob and the pool. Nothing bounces or rings.
- Real 3D, ray-marched through a long lens: blobs stretched along their climb, a lobe trailing each, run together only where they touch, passing in front of and behind each other.
- Lit by the bulb through the wax beneath, translucent where it's thin, creased where wax meets wax, with a glossy skin; a depth of field, bloom, a filmic tone curve, a vignette and grain.
- Five palettes (`amber`, `magenta`, `ember`, `acid`, `violet`) or colours of your own, `var(--…)` included.
- Seeded, every moment worked out from the time alone; sized to any box; moving only on screen; still under reduced motion; drawn smaller if frames come slowly; a stand-in until it's drawn, which React's server draws too.
