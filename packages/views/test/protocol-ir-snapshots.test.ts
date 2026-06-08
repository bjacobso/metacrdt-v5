import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PROTOCOL_IR_SNAPSHOT_TARGETS,
  buildProtocolIrSnapshot,
} from "../scripts/protocol-ir-snapshots.js";

describe("ViewSpec protocol IR JSON snapshots", () => {
  it.each(PROTOCOL_IR_SNAPSHOT_TARGETS)("keeps $name protocol IR JSON up to date", (target) => {
    const actual = buildProtocolIrSnapshot(target);
    const expected = JSON.parse(readFileSync(target.snapshotFile, "utf8")) as unknown;

    expect(actual).toEqual(expected);
  });
});
