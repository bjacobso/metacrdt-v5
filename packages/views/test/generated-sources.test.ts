import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VIEW_PROTOCOL_GENERATED_SOURCES } from "../scripts/generate-view-node.js";

describe("generated ViewSpec protocol sources", () => {
  it.each(VIEW_PROTOCOL_GENERATED_SOURCES)("keeps $path up to date", (source) => {
    expect(readFileSync(source.path, "utf8")).toBe(source.render());
  });
});
