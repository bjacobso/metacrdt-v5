import { describe, expect, test } from "vitest";
import { assert as assertEvent, fromEvents, valueOf } from "@metacrdt/core";
import {
  applyOperation,
  createMemoryRuntime,
  deltaSince,
  exchangeDeltas,
  mergeFrom,
  requireCapability,
  versionVector,
} from "./index.js";

const many = () => "many" as const;
const one = () => "one" as const;
const coord = { txTime: 10_000, validTime: 10_000 };

describe("@metacrdt/runtime memory harness", () => {
  test("applies operations through injected clock/store/transport services", async () => {
    let wall = 100;
    const rt = createMemoryRuntime({ replicaId: "r1", wall: () => wall });

    const event = await applyOperation(rt, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });

    expect(event.hlc).toEqual({ pt: 100, l: 0, r: "r1" });
    expect(event.seq).toBe(1);
    expect(await rt.store.get(event.id)).toEqual(event);
    expect(rt.transport.published).toEqual([[event]]);

    wall = 100;
    const next = await applyOperation(rt, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(next.hlc).toEqual({ pt: 100, l: 1, r: "r1" });
    expect(next.seq).toBe(2);

    const log = fromEvents(await rt.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
  });

  test("two runtimes converge after exchanging G-Set events", async () => {
    const a = createMemoryRuntime({ replicaId: "ra", wall: () => 100 });
    const b = createMemoryRuntime({ replicaId: "rb", wall: () => 100 });

    await applyOperation(a, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    await applyOperation(b, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "right",
      actor: "bob",
    });

    await mergeFrom(a, await b.store.scan());
    await mergeFrom(b, await a.store.scan());

    const logA = fromEvents(await a.store.scan());
    const logB = fromEvents(await b.store.scan());
    expect([...logA.keys()].sort()).toEqual([...logB.keys()].sort());
    const valuesA = (valueOf("task:1", "tag", coord, logA, many) as string[]).sort();
    const valuesB = (valueOf("task:1", "tag", coord, logB, many) as string[]).sort();
    expect(valuesA).toEqual(valuesB);
    expect(valuesA).toEqual(["left", "right"]);
  });

  test("version-vector deltas send only unseen sequenced events", async () => {
    const a = createMemoryRuntime({ replicaId: "ra", wall: () => 100 });
    const first = await applyOperation(a, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    const second = await applyOperation(a, {
      op: "assert",
      e: "task:2",
      a: "tag",
      v: "right",
      actor: "alice",
    });

    const events = await a.store.scan();
    expect(versionVector(events)).toEqual({ ra: 2 });
    expect(deltaSince(events, {}).events.map((e) => e.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(deltaSince(events, { ra: 1 }).events.map((e) => e.id)).toEqual([
      second.id,
    ]);
    expect(deltaSince(events, { ra: 2 }).events).toEqual([]);
  });

  test("anti-entropy exchange is idempotent and converges version vectors", async () => {
    const a = createMemoryRuntime({ replicaId: "ra", wall: () => 100 });
    const b = createMemoryRuntime({ replicaId: "rb", wall: () => 100 });

    await applyOperation(a, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    await applyOperation(b, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "right",
      actor: "bob",
    });

    const first = await exchangeDeltas(a, b);
    expect(first).toMatchObject({
      sentFromA: 1,
      sentFromB: 1,
      insertedIntoA: 1,
      insertedIntoB: 1,
      vvA: { ra: 1, rb: 1 },
      vvB: { ra: 1, rb: 1 },
    });

    const second = await exchangeDeltas(a, b);
    expect(second).toMatchObject({
      sentFromA: 0,
      sentFromB: 0,
      insertedIntoA: 0,
      insertedIntoB: 0,
    });
  });

  test("legacy unsequenced events remain compatible with delta exchange", async () => {
    const a = createMemoryRuntime({ replicaId: "ra", wall: () => 100 });
    const b = createMemoryRuntime({ replicaId: "rb", wall: () => 100 });
    const event = assertEvent({
      e: "legacy:1",
      a: "status",
      v: "visible",
      actor: "alice",
      actorType: "human",
      validFrom: 100,
      validTo: null,
      hlc: { pt: 100, l: 0, r: "ra" },
    });
    await a.store.append(event);

    expect(event.seq).toBeUndefined();
    expect(deltaSince([event], { ra: 99 }).events).toEqual([event]);

    const first = await exchangeDeltas(a, b);
    const second = await exchangeDeltas(a, b);
    expect(first.insertedIntoB).toBe(1);
    expect(second.insertedIntoB).toBe(0);
  });

  test("target lifecycle operations are regular convergent events", async () => {
    const rt = createMemoryRuntime({ replicaId: "r1", wall: () => 100 });
    const assertion = await applyOperation(rt, {
      op: "assert",
      e: "doc:1",
      a: "status",
      v: "draft",
      actor: "user:1",
    });
    await applyOperation(rt, {
      op: "retract",
      target: assertion.id,
      actor: "user:1",
    });

    const log = fromEvents(await rt.store.scan());
    expect(valueOf("doc:1", "status", coord, log, one)).toBeUndefined();
    expect(valueOf("doc:1", "status", coord, log, one, { includeRetracted: true })).toBe(
      "draft",
    );
  });

  test("capabilities are explicit and checked by operation helpers", () => {
    const rt = createMemoryRuntime({
      replicaId: "r1",
      capabilities: [],
    });
    expect(() => requireCapability(rt, "convergent-log")).toThrow(
      /lacks convergent-log/,
    );
  });
});
