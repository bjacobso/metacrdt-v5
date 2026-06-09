import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the full static homepage", () => {
    const html = renderToString(<App />);

    expect(html).toContain("MetaCRDT");
    expect(html).toContain("A two-layer construction");
    expect(html).toContain("Event identity, ordering, visibility, and merge");
    expect(html).toContain("If derivation is a deterministic fold");
    expect(html).toContain("The reference runtime is an implementation");
    expect(html).toContain("Research Preview");
  });
});
