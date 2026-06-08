import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  VIEWSPEC_IR_SNAPSHOT_TARGETS,
  buildViewSpecIrSnapshot,
} from "../scripts/viewspec-ir-snapshots.js";

describe("ViewSpec component IR JSON snapshots", () => {
  it.each(VIEWSPEC_IR_SNAPSHOT_TARGETS)("keeps $name ViewSpec IR JSON up to date", (target) => {
    const actual = buildViewSpecIrSnapshot(target);
    const expected = JSON.parse(readFileSync(target.snapshotFile, "utf8")) as unknown;

    expect(actual).toEqual(expected);
  });

  it.each(VIEWSPEC_IR_SNAPSHOT_TARGETS)(
    "keeps $name compile specs compact and registry-derived",
    (target) => {
      const actual = buildViewSpecIrSnapshot(target);
      const serializedCompileSpecs = JSON.stringify(actual.compileSpecs);

      expect(serializedCompileSpecs).not.toContain("opaqueProps");
      expect(serializedCompileSpecs).not.toContain("view/component");
      expect(serializedCompileSpecs).not.toContain("view/layout-alias");
      expect(serializedCompileSpecs).not.toContain("view/compile-layout-tree");

      for (const spec of actual.compileSpecs) {
        expect(Object.keys(spec).sort()).toEqual(
          spec.unknownPropsKind === undefined
            ? ["aliases", "component", "events", "name", "slots"]
            : ["aliases", "component", "events", "name", "slots", "unknownPropsKind"],
        );
        for (const slot of spec.slots) {
          expect(Object.keys(slot).sort()).toEqual(["aliases", "field", "key", "kind"]);
        }
      }

      expect(
        actual.compileSpecs
          .filter((spec) => spec.unknownPropsKind !== undefined)
          .map((spec) => [spec.name, spec.unknownPropsKind]),
      ).toEqual([["custom", "json"]]);
    },
  );
});
