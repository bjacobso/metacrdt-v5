/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";

export const modules = import.meta.glob("./**/*.*s");

export function initComponentTest() {
  return convexTest(schema, modules);
}

test("component test setup", () => {});
