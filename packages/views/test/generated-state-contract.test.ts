import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ViewState as RootViewState,
  ViewStateDecl as RootViewStateDecl,
  type ViewStateDecl as ViewStateDeclType,
} from "../src/index.js";
import {
  ViewState as GeneratedViewState,
  ViewStateDecl as GeneratedViewStateDecl,
} from "../src/generated/view-state.generated.js";

const decodeState = (input: unknown): ViewStateDeclType => {
  return Schema.decodeUnknownSync(RootViewStateDecl)(input);
};

const lit = (value: unknown) => ({ kind: "literal" as const, value });

describe("generated ViewSpec state contract", () => {
  it("is the public state declaration contract", () => {
    expect(RootViewStateDecl).toBe(GeneratedViewStateDecl);
    expect(RootViewState).toBe(GeneratedViewState);
  });

  it("decodes state declarations through the generated schema", () => {
    expect(decodeState({ kind: "string", initial: "hello" })).toEqual({
      kind: "string",
      initial: "hello",
    });
    expect(decodeState({ kind: "list", item: { kind: "number" } })).toEqual({
      kind: "list",
      item: { kind: "number" },
    });
    expect(
      decodeState({
        kind: "object",
        fields: { name: { kind: "string" } },
      }),
    ).toEqual({
      kind: "object",
      fields: { name: { kind: "string" } },
    });
    expect(
      decodeState({
        kind: "component",
        initial: { type: "text", content: lit("hi") },
      }),
    ).toEqual({
      kind: "component",
      initial: { type: "text", content: lit("hi") },
    });
    expect(decodeState({ kind: "component", initial: null })).toEqual({
      kind: "component",
      initial: null,
    });
    expect(decodeState({ kind: "json", initial: { arbitrary: true } })).toEqual({
      kind: "json",
      initial: { arbitrary: true },
    });
  });
});
