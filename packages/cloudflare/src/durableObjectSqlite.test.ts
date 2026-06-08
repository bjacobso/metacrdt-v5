import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  EventStoreService,
  applyOperation,
  applyOperationEffect,
  exchangeDeltas,
  versionVector,
} from "@metacrdt/runtime";
import { Effect } from "effect";
import {
  createDurableObjectSqliteCurrentSurface,
  createDurableObjectSqliteRuntime,
  createDurableObjectSqliteRuntimeLayer,
} from "./index.js";
import { FakeDurableObjectSqlStorage } from "./sqliteFake.test-support.js";

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;
const many = () => "many" as const;
const cardinalityOf = (a: string) => (a === "worker.tag" ? "many" : "one");

describe("@metacrdt/cloudflare Durable Object SQLite runtime", () => {
  test("provides an Effect Layer and stamps seq/version-vector metadata", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const event = yield* applyOperationEffect({
            op: "assert",
            e: "do-sqlite:layer",
            a: "status",
            v: "ready",
            actor: "test",
            actorType: "system",
          });
          const store = yield* EventStoreService;
          return {
            event,
            stored: yield* store.get(event.id),
            events: yield* store.scan(),
          };
        }),
        createDurableObjectSqliteRuntimeLayer({
          sql: new FakeDurableObjectSqlStorage(),
          replicaId: "do-sqlite:layer",
          wall: () => 50,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "do-sqlite:layer": 1 });
  });

  test("persists event log, HLC, and per-replica sequence across runtime recreation", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    let wall = 100;
    const first = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:room",
      wall: () => wall,
    });

    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(active.hlc).toEqual({ pt: 100, l: 0, r: "do-sqlite:room" });
    expect(active.seq).toBe(1);

    wall = 100;
    const second = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:room",
      wall: () => wall,
    });
    expect(second.clock.current()).toEqual({
      pt: 100,
      l: 0,
      r: "do-sqlite:room",
    });
    expect(second.sequencer.current()).toBe(1);

    const terminated = await applyOperation(second, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(terminated.hlc).toEqual({ pt: 100, l: 1, r: "do-sqlite:room" });
    expect(terminated.seq).toBe(2);

    const third = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:room",
      wall: () => 100,
    });
    const log = fromEvents(await third.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
    expect(versionVector(await third.store.scan())).toEqual({
      "do-sqlite:room": 2,
    });
  });

  test("two SQLite runtimes exchange deltas and persist convergence", async () => {
    const leftSql = new FakeDurableObjectSqlStorage();
    const rightSql = new FakeDurableObjectSqlStorage();
    const left = await createDurableObjectSqliteRuntime({
      sql: leftSql,
      replicaId: "do-sqlite:left",
      wall: () => 200,
    });
    const right = await createDurableObjectSqliteRuntime({
      sql: rightSql,
      replicaId: "do-sqlite:right",
      wall: () => 200,
    });

    await applyOperation(left, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    await applyOperation(right, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "right",
      actor: "bob",
    });

    const first = await exchangeDeltas(left, right);
    expect(first).toMatchObject({
      sentFromA: 1,
      sentFromB: 1,
      insertedIntoA: 1,
      insertedIntoB: 1,
      vvA: { "do-sqlite:left": 1, "do-sqlite:right": 1 },
      vvB: { "do-sqlite:left": 1, "do-sqlite:right": 1 },
    });

    const restartedLeft = await createDurableObjectSqliteRuntime({
      sql: leftSql,
      replicaId: "do-sqlite:left",
      wall: () => 200,
    });
    const restartedRight = await createDurableObjectSqliteRuntime({
      sql: rightSql,
      replicaId: "do-sqlite:right",
      wall: () => 200,
    });
    const leftLog = fromEvents(await restartedLeft.store.scan());
    const rightLog = fromEvents(await restartedRight.store.scan());
    expect([...leftLog.keys()].sort()).toEqual([...rightLog.keys()].sort());
    expect(
      (valueOf("task:1", "tag", coord, leftLog, many) as string[]).sort(),
    ).toEqual(["left", "right"]);
    expect(
      (valueOf("task:1", "tag", coord, rightLog, many) as string[]).sort(),
    ).toEqual(["left", "right"]);

    const second = await exchangeDeltas(restartedLeft, restartedRight);
    expect(second).toMatchObject({
      sentFromA: 0,
      sentFromB: 0,
      insertedIntoA: 0,
      insertedIntoB: 0,
    });
  });

  test("rejects invalid stored event ids on scan", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:verify",
      wall: () => 300,
    });
    const event = await applyOperation(runtime, {
      op: "assert",
      e: "doc:1",
      a: "status",
      v: "ready",
      actor: "user:1",
    });
    sql.putStoredEvent({ ...event, id: "bad" });

    const restarted = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:verify",
      wall: () => 300,
    });
    await expect(restarted.store.scan()).rejects.toThrow(/invalid stored event id/);
  });

  test("current surface appends, rebuilds, and reads entity state from SQLite projection rows", async () => {
    const runtime = await createDurableObjectSqliteRuntime({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: "do-sqlite:surface",
      wall: () => 400,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    await surface.appendAssert({
      e: "worker:maria",
      a: "type",
      v: "Worker",
      actor: "user:1",
    });
    await surface.appendAssert({
      e: "worker:maria",
      a: "name",
      v: "Maria",
      actor: "user:1",
    });
    await surface.appendAssert({
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    const winner = await surface.appendAssert({
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    await surface.appendAssert({
      e: "worker:maria",
      a: "worker.tag",
      v: "remote",
      actor: "user:1",
    });
    await surface.appendAssert({
      e: "worker:maria",
      a: "worker.tag",
      v: "urgent",
      actor: "user:1",
    });
    await surface.appendAssert({
      e: "task:1",
      a: "type",
      v: "Task",
      actor: "user:1",
    });

    expect(winner.projection).toMatchObject({
      events: 4,
      rows: 3,
    });

    const status = await surface.listCurrent({
      e: "worker:maria",
      a: "worker.status",
    });
    expect(status).toMatchObject([
      {
        e: "worker:maria",
        a: "worker.status",
        v: "terminated",
        eventId: winner.event.id,
      },
    ]);

    await expect(surface.getEvent({ id: winner.event.id })).resolves.toEqual(
      winner.event,
    );
    await expect(
      surface.listEvents({ e: "worker:maria" }),
    ).resolves.toHaveLength(6);
    await expect(
      surface.listEvents({ e: "worker:maria", a: "worker.status" }),
    ).resolves.toHaveLength(2);
    await expect(
      surface.listEvents({ ids: [winner.event.id] }),
    ).resolves.toEqual([winner.event]);
    await expect(surface.listEvents({ limit: 2 })).resolves.toHaveLength(2);

    const entity = await surface.getCurrentEntity({ e: "worker:maria" });
    expect(entity).toMatchObject({
      e: "worker:maria",
      attributes: {
        type: ["Worker"],
        name: ["Maria"],
        "worker.status": ["terminated"],
      },
    });
    expect([...(entity?.attributes["worker.tag"] ?? [])].sort()).toEqual([
      "remote",
      "urgent",
    ]);

    await expect(surface.listCurrentEntities({ type: "Worker" })).resolves.toEqual([
      {
        e: "worker:maria",
        type: "Worker",
        name: "Maria",
        rows: 5,
      },
    ]);
  });

  test("current surface rebuilds lifecycle changes into empty current state", async () => {
    const runtime = await createDurableObjectSqliteRuntime({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: "do-sqlite:lifecycle",
      wall: () => 500,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    const asserted = await surface.appendAssert({
      e: "worker:closed",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(await surface.listCurrent({ e: "worker:closed" })).toHaveLength(1);

    const retracted = await surface.appendLifecycle({
      kind: "retract",
      target: asserted.event.id,
      actor: "user:1",
      reason: "closed",
    });

    expect(retracted.projection).toEqual({
      events: 2,
      rows: 0,
    });
    await expect(surface.listCurrent({ e: "worker:closed" })).resolves.toEqual([]);
    await expect(
      surface.getCurrentEntity({ e: "worker:closed" }),
    ).resolves.toBeNull();
  });
});
