"use client";

/**
 * A lava lamp in React:
 *
 *   import { Lava } from "@cesarvenzac/lava/react";
 *
 *   <Lava palette="magenta" style={{ height: 480 }} />
 *
 * Give it a size: the wax fills it. Children are drawn over the wax, so a lamp can be the
 * background of a hero; on its own it's a picture, named by `label`. A server draws the liquid lit
 * from below, which the wax fades in over once the browser has drawn it.
 */

import { type CSSProperties, type HTMLAttributes, type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

import { type Lava as Handle, lava } from "./lava.ts";
import { DEFAULTS, type LavaOptions, settle } from "./options.ts";
import { standInOf } from "./palettes.ts";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type LavaProps = LavaOptions &
  Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    /** Drawn over the wax. */
    children?: ReactNode;
    /** Called with the lamp once it's made, and with null once it's gone: for `seek()` and the like. */
    handle?: (lamp: Handle | null) => void;
  };

/** A `<div>` with a lava lamp drawn in it. */
export function Lava({
  palette,
  colours,
  seed,
  speed,
  count,
  size,
  pool,
  wobble,
  glow,
  bloom,
  gloss,
  exposure,
  aperture,
  focus,
  haze,
  grain,
  label,
  reducedMotion,
  start,
  maxPixels,
  paused,
  handle,
  children,
  style,
  ...rest
}: LavaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const made = useRef<Handle | null>(null);
  const options: LavaOptions = { palette, colours, seed, speed, count, size, pool, wobble, glow, bloom, gloss, exposure, aperture, focus, haze, grain, label, reducedMotion, start, maxPixels, paused };
  const latest = useRef({ options, handle });
  // Before the effects below read them: this render's options and callback.
  useIsomorphicLayoutEffect(() => {
    latest.current = { options, handle };
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const lamp = lava(element, latest.current.options);
    made.current = lamp;
    latest.current.handle?.(lamp);
    return () => {
      latest.current.handle?.(null);
      lamp.destroy();
      made.current = null;
    };
  }, []);

  const key = JSON.stringify(options);
  useEffect(() => {
    made.current?.set(latest.current.options);
  }, [key]);

  const alone = children == null;
  const settled = settle({ palette, colours });
  const box: CSSProperties = { position: "relative", isolation: "isolate", background: standInOf(settled.colours), ...style };
  return (
    <div
      ref={ref}
      role={alone ? "img" : undefined}
      aria-label={alone ? (label ?? DEFAULTS.label) : undefined}
      {...rest}
      style={box}
    >
      {children}
    </div>
  );
}
