import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the full static homepage", () => {
    const html = renderToString(<App />);

    expect(html).toContain("MetaCRDT");
    expect(html).toContain("The log is a CRDT. Everything else is a fold.");
    expect(html).toContain("Events accumulate. Folds explain what is visible.");
    expect(html).toContain("Derivation also converges.");
    expect(html).toContain("Each layer is only facts.");
    expect(html).toContain("Research Preview");
  });
});
