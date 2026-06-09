import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  "src/App.tsx",
  "src/main.tsx",
  "src/content/copy.ts",
  "src/ascii/AsciiScene.tsx",
  "src/ascii/engine.ts",
  "src/ascii/scenes.ts",
  "src/lib/useInView.ts",
  "src/lib/usePrefersReducedMotion.ts",
  "src/lib/useRaf.ts",
  "src/sections/Conformance.tsx",
  "src/sections/FirstPrinciples.tsx",
  "src/sections/Footer.tsx",
  "src/sections/Hero.tsx",
  "src/sections/Layers.tsx",
  "src/sections/Meta.tsx",
  "src/sections/Problem.tsx",
  "src/sections/Protocol.tsx",
  "src/sections/Status.tsx",
] as const;

describe("website import boundary", () => {
  it("does not import Convex or sibling runtime packages", () => {
    const offenders = sourceFiles.flatMap((file) => {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      return /from\s+["'](?:convex|@metacrdt\/)/.test(content) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});
