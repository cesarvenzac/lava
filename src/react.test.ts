import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PALETTES } from "./palettes.ts";
import { Lava } from "./react.tsx";

describe("Lava on a server", () => {
  it("draws the liquid lit from below, as a picture named by its label", () => {
    const markup = renderToStaticMarkup(createElement(Lava, { palette: "acid", label: "A lamp", className: "hero" }));
    expect(markup).toContain(`role="img"`);
    expect(markup).toContain(`aria-label="A lamp"`);
    expect(markup).toContain(`class="hero"`);
    expect(markup).toContain(PALETTES.acid.liquid);
    expect(markup).toContain("isolation:isolate");
  });

  it("is only the background of what's drawn over it, and says nothing itself", () => {
    const markup = renderToStaticMarkup(createElement(Lava, null, createElement("h1", null, "Hello")));
    expect(markup).not.toContain(`role="img"`);
    expect(markup).not.toContain("aria-label");
    expect(markup).toContain("<h1>Hello</h1>");
  });

  it("takes colours given over its palette's", () => {
    const markup = renderToStaticMarkup(createElement(Lava, { colours: { liquid: "black" } }));
    expect(markup).toContain("black");
    expect(markup).toContain(PALETTES.amber.light);
  });
});
