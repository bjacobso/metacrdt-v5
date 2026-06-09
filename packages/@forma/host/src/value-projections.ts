import type { ProjectValueResult, ValueProjection } from "./types.js";

export function projectInlineValue(
  value: ValueProjection,
  projections: readonly string[],
): Omit<ProjectValueResult, "diagnostics"> {
  return {
    value,
    ...(projections.includes("printed") ? { printed: printProjectedValue(value) } : {}),
    ...(projections.includes("plain-json") ? { plainJson: plainJsonFromValue(value) } : {}),
    ...(projections.includes("truthy") ? { truthy: truthyProjection(value) } : {}),
    ...(projections.includes("summary") ? { summary: summaryProjection(value) } : {}),
  };
}

export function keyStringFromProjection(value: ValueProjection): string {
  switch (value.kind) {
    case "string":
    case "symbol":
    case "keyword":
      return value.value;
    default:
      return JSON.stringify(plainJsonFromValue(value));
  }
}

export function printProjectedValue(value: ValueProjection): string {
  switch (value.kind) {
    case "nil":
      return "nil";
    case "bool":
    case "int":
    case "float":
      return String(value.value);
    case "string":
      return JSON.stringify(value.value);
    case "keyword":
    case "symbol":
      return value.value;
    case "list":
      return `(${value.items.map(printProjectedValue).join(" ")})`;
    case "vector":
      return `[${value.items.map(printProjectedValue).join(" ")}]`;
    case "map":
      return `{${value.entries
        .map((entry) => `${printProjectedValue(entry.key)} ${printProjectedValue(entry.value)}`)
        .join(" ")}}`;
    case "function":
      return value.display ?? `<function ${value.valueRef}>`;
    case "opaque":
      return value.display ?? `<${value.tag}>`;
  }
}

export function plainJsonFromValue(value: ValueProjection): unknown {
  switch (value.kind) {
    case "nil":
      return null;
    case "bool":
    case "int":
    case "float":
    case "string":
    case "keyword":
    case "symbol":
      return value.value;
    case "list":
    case "vector":
      return value.items.map(plainJsonFromValue);
    case "map":
      return Object.fromEntries(
        value.entries.map((entry) => [
          keyStringFromProjection(entry.key),
          plainJsonFromValue(entry.value),
        ]),
      );
    case "function":
      return { kind: "function", valueRef: value.valueRef, display: value.display };
    case "opaque":
      return {
        kind: "opaque",
        tag: value.tag,
        valueRef: value.valueRef,
        display: value.display,
      };
  }
}

export function truthyProjection(value: ValueProjection): boolean {
  if (value.kind === "nil") return false;
  if (value.kind === "bool") return value.value;
  return true;
}

export function summaryProjection(value: ValueProjection): {
  readonly kind: string;
  readonly size?: number;
} {
  switch (value.kind) {
    case "list":
    case "vector":
      return { kind: value.kind, size: value.items.length };
    case "map":
      return { kind: value.kind, size: value.entries.length };
    default:
      return { kind: value.kind };
  }
}
