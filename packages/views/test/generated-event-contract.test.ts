import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ViewEventMap as RootViewEventMap,
  type ViewEventMap as ViewEventMapType,
} from "../src/index.js";
import { ViewEventMap as GeneratedViewEventMap } from "../src/generated/view-event.generated.js";

const decodeEventMap = (input: unknown): ViewEventMapType => {
  return Schema.decodeUnknownSync(RootViewEventMap)(input);
};

describe("generated ViewSpec event contract", () => {
  it("is the public event map contract", () => {
    expect(RootViewEventMap).toBe(GeneratedViewEventMap);
  });

  it("decodes event callback maps through the generated schema", () => {
    expect(
      decodeEventMap({
        onClick: { action: "setState", key: "selectedId", value: "emp:alice" },
      }),
    ).toEqual({
      onClick: { action: "setState", key: "selectedId", value: "emp:alice" },
    });

    expect(
      decodeEventMap({
        onRowClick: { action: "setState", key: "selectedRow", value: "row-1" },
      }),
    ).toEqual({
      onRowClick: { action: "setState", key: "selectedRow", value: "row-1" },
    });

    expect(
      decodeEventMap({
        onChange: [{ action: "runQuery", query: "active-employees" }],
      }),
    ).toEqual({
      onChange: [{ action: "runQuery", query: "active-employees" }],
    });

    expect(
      decodeEventMap({
        onOpenChange: { action: "closeDialog", dialogId: "employee-detail" },
      }),
    ).toEqual({
      onOpenChange: { action: "closeDialog", dialogId: "employee-detail" },
    });
  });
});
