/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Confect sidecar spike", () => {
  test("verifies protocol-shaped fact events through @metacrdt/core", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.facts.assertFact, {
      e: "worker:confect",
      a: "worker.status",
      value: "active",
      reason: "confect spike",
    });

    const events = await t.query(api.metacrdtConfect.verifyEvents, {
      e: "worker:confect",
      a: "worker.status",
      requireValid: true,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "assert",
      e: "worker:confect",
      a: "worker.status",
      hasProtocolMetadata: true,
      verifiable: true,
      validEventId: true,
    });
  });

  test("surfaces typed Confect errors across the Convex boundary", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });

    await expect(
      t.query(api.metacrdtConfect.verifyEvents, {
        e: "missing:entity",
      }),
    ).rejects.toMatchObject({
      data: {
        _tag: "UnknownEntity",
        e: "missing:entity",
      },
    });
  });
});
