import { describe, expect, test } from "vitest";
import { assert as assertEvent, fromEvents, valueOf } from "@metacrdt/core";
import { Effect, Layer } from "effect";
import {
  DatalogQueryService,
  EventStoreService,
  ProjectionStoreService,
  RuntimeCapabilityError,
  RuntimeOperationError,
  applyOperationEffect,
  applyOperation,
  createMemoryRuntime,
  createMemoryRuntimeLayer,
  datalogQueryLayer,
  deltaSince,
  exchangeDeltas,
  mergeFrom,
  projectionDatalogQueryLayer,
  projectionRowsFromLog,
  requireCapability,
  versionVector,
} from "./index.js";

const many = () => "many" as const;
const one = () => "one" as const;
const coord = { txTime: 10_000, validTime: 10_000 };

describe("@metacrdt/runtime memory harness", () => {
  test("Effect services apply operations through a Layer-provided memory target", async () => {
    let wall = 100;
    const layer = createMemoryRuntimeLayer({
      replicaId: "effect:r1",
      wall: () => wall,
    });

    const program = Effect.gen(function* () {
      const first = yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.status",
        v: "active",
        actor: "user:1",
      });
      wall = 100;
      const second = yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.status",
        v: "terminated",
        actor: "user:1",
      });
      const store = yield* EventStoreService;
      return { first, second, events: yield* store.scan() };
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.first.hlc).toEqual({ pt: 100, l: 0, r: "effect:r1" });
    expect(result.first.seq).toBe(1);
    expect(result.second.hlc).toEqual({ pt: 100, l: 1, r: "effect:r1" });
    expect(result.second.seq).toBe(2);

    const log = fromEvents(result.events);
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
  });

  test("memory Layer can materialize current projection rows", async () => {
    const layer = createMemoryRuntimeLayer({
      replicaId: "effect:projection",
      wall: () => 100,
    });
    const program = Effect.gen(function* () {
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.status",
        v: "active",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.status",
        v: "terminated",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.tag",
        v: "remote",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.tag",
        v: "urgent",
        actor: "user:1",
      });
      const store = yield* EventStoreService;
      const projection = yield* ProjectionStoreService;
      const rows = projectionRowsFromLog(
        fromEvents(yield* store.scan()),
        coord,
        (a) => (a === "worker.tag" ? "many" : "one"),
      );
      const replaced = yield* projection.replace(rows);
      return {
        replaced,
        status: yield* projection.scan({
          e: "worker:maria",
          a: "worker.status",
        }),
        tags: yield* projection.scan({ e: "worker:maria", a: "worker.tag" }),
      };
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.replaced.rows).toBe(3);
    expect(result.status.map((row) => row.v)).toEqual(["terminated"]);
    expect(result.tags.map((row) => row.v).sort()).toEqual(["remote", "urgent"]);
  });

  test("DatalogQueryService queries and paginates through Layer-provided services", async () => {
    const layer = Layer.provideMerge(
      createMemoryRuntimeLayer({
        replicaId: "effect:query",
        wall: () => 100,
      }),
    )(datalogQueryLayer());

    const program = Effect.gen(function* () {
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:c",
        a: "worker.status",
        v: "active",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:a",
        a: "worker.status",
        v: "active",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:b",
        a: "worker.status",
        v: "active",
        actor: "user:1",
      });

      const datalog = yield* DatalogQueryService;
      const first = yield* datalog.page({
        where: [["?e", "worker.status", "active"]],
        select: ["?e"],
        coord,
        paginationOpts: { numItems: 2 },
      });
      const second = yield* datalog.page({
        where: [["?e", "worker.status", "active"]],
        select: ["?e"],
        coord,
        paginationOpts: { numItems: 2, cursor: first.continueCursor },
      });
      return { first, second };
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.first.page).toEqual([{ e: "worker:a" }, { e: "worker:b" }]);
    expect(result.first.isDone).toBe(false);
    expect(result.first.continueCursor).toBe("2");
    expect(result.second.page).toEqual([{ e: "worker:c" }]);
    expect(result.second.isDone).toBe(true);
    expect(result.second.continueCursor).toBeNull();
  });

  test("projection-backed DatalogQueryService queries materialized current rows", async () => {
    const layer = Layer.provideMerge(
      createMemoryRuntimeLayer({
        replicaId: "effect:projection-query",
        wall: () => 100,
      }),
    )(projectionDatalogQueryLayer());

    const program = Effect.gen(function* () {
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "type",
        v: "Worker",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.status",
        v: "terminated",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.tag",
        v: "remote",
        actor: "user:1",
      });
      yield* applyOperationEffect({
        op: "assert",
        e: "worker:maria",
        a: "worker.tag",
        v: "urgent",
        actor: "user:1",
      });

      const store = yield* EventStoreService;
      const projection = yield* ProjectionStoreService;
      yield* projection.replace(
        projectionRowsFromLog(
          fromEvents(yield* store.scan()),
          coord,
          (a) => (a === "worker.tag" ? "many" : "one"),
        ),
      );

      const datalog = yield* DatalogQueryService;
      const query = yield* datalog.query({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.status", "terminated"],
        ],
        select: ["?w"],
        coord,
      });
      const firstTag = yield* datalog.page({
        where: [["worker:maria", "worker.tag", "?tag"]],
        select: ["?tag"],
        coord,
        paginationOpts: { numItems: 1 },
      });
      const aggregate = yield* datalog.aggregate({
        where: [["worker:maria", "worker.tag", "?tag"]],
        coord,
        groupBy: [],
        aggregates: [{ op: "count", as: "tags" }],
      });
      const derived = yield* datalog.derivedRows({
        where: [["?w", "worker.status", "terminated"]],
        coord,
        emit: { e: "?w", a: "worker.offboarded", v: true },
      });
      return { query, firstTag, aggregate, derived };
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.query.rows).toEqual([{ w: "worker:maria" }]);
    expect(result.query.eventSourceIds).toHaveLength(2);
    expect(result.firstTag).toMatchObject({
      page: [{ tag: "remote" }],
      continueCursor: "1",
      isDone: false,
    });
    expect(result.aggregate).toEqual([{ tags: 2 }]);
    expect(result.derived).toEqual([
      { e: "worker:maria", a: "worker.offboarded", v: true },
    ]);
  });

  test("DatalogQueryService validation and parser failures stay in the Effect error channel", async () => {
    const layer = Layer.provideMerge(
      createMemoryRuntimeLayer({
        replicaId: "effect:query-errors",
        wall: () => 100,
      }),
    )(datalogQueryLayer());

    const program = Effect.gen(function* () {
      const datalog = yield* DatalogQueryService;
      const invalidArgs = yield* Effect.match(
        datalog.query({
          where: "not clauses",
          select: ["?e"],
          coord,
        } as never),
        {
          onFailure: (error) => error,
          onSuccess: () => undefined,
        },
      );
      const invalidClause = yield* Effect.match(
        datalog.query({
          where: [["?e"]],
          select: ["?e"],
          coord,
        }),
        {
          onFailure: (error) => error,
          onSuccess: () => undefined,
        },
      );
      return { invalidArgs, invalidClause };
    });

    const result = await Effect.runPromise(Effect.provide(program, layer));
    expect(result.invalidArgs).toBeInstanceOf(RuntimeOperationError);
    if (result.invalidArgs instanceof RuntimeOperationError) {
      expect(result.invalidArgs.operation).toBe("DatalogQuery.query.args");
    }
    expect(result.invalidClause).toBeInstanceOf(RuntimeOperationError);
    if (result.invalidClause instanceof RuntimeOperationError) {
      expect(result.invalidClause.operation).toBe("DatalogQuery.parse");
    }
  });

  test("Effect operation helpers fail with tagged errors", async () => {
    const layer = createMemoryRuntimeLayer({
      replicaId: "effect:no-cap",
      capabilities: [],
    });
    const program = applyOperationEffect({
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });

    const result = await Effect.runPromiseExit(Effect.provide(program, layer));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const failure = result.cause.toJSON() as { _tag?: string };
      expect(JSON.stringify(failure)).toContain("RuntimeCapabilityError");
    }

    const recovered = await Effect.runPromise(
      Effect.provide(
        Effect.match(program, {
          onFailure: (error) => error,
          onSuccess: () => undefined,
        }),
        layer,
      ),
    );
    expect(recovered).toBeInstanceOf(RuntimeCapabilityError);
  });

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
