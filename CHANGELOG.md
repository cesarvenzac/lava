# Changelog

## 1.0.0

Lava's options and its handle are stable from here: a change that breaks them waits for 2.0. The wax now parts into blobs of every size and beads, and a box can hold a tank of its own shape, deep and seen from in front.

- Necks part: a blob whose insides fall into two parts joined only by skin, held so for a second, parts there, and a long thread's middle goes off as beads. Several blobs are up at once now, most a tenth to a third of the lamp's width, with beads among them, and they gather under the top before dropping off.
- The coil heats steadily, as a bulb does: its heat no longer swells and fades. With necks parting, a steady coil makes plume after plume rather than a column standing over it.
- A blob that sinks onto the pool runs into it four times sooner than blobs run into each other, so the pool stays one mass rather than a foam of blobs pressed together; so do blobs lying on the floor into each other.
- `shape`: `lamp` (the default), the tall lamp as before, or `box`, a tank the box's own shape: as wide as the box up to 16:9 (a wider box shows a band) and three tenths as deep as it's tall, a coil every so often across its floor, its whole width and height shown, started again from its own warm start when the box's shape changes much. It's seen from in front, nearer wax larger and the focus falling off behind it. Its floor and sides hold the pool as more wax would, and its cool wax lying on the floor is heavier, so the pool lies as one layer across it rather than beading into mounds between the coils or drawing itself into one in the middle. Its wax is a little coarser than the lamp's, so a 16:9 tank is ten thousand particles. A 16:9 hero is a lamp of its own rather than a band of a tall one.
- `view: "section"`: a clean cut through the tank's middle, drawn flat, its warmth in its colour, with no lens, bloom or grain.
- Fixed: now and then two stray particles still labelled as one blob, all but out of reach of each other, were flung apart by the surface tension's correction for thin skin (it divided by the density between them, next to none), and the lamp blew apart after them. The correction is held to ten times, well past what a thread a particle across needs.
- Wax pressed against the front or back glass is drawn rounded off it, rather than as a dark ring.
- The README opens on a loop of a 16:9 tank.

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
