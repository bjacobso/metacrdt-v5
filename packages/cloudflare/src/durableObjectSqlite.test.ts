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
  createDurableObjectSqliteAlarmMultiplexer,
  createDurableObjectSqliteCurrentSurface,
  createDurableObjectSqliteRuntime,
  createDurableObjectSqliteRuntimeLayer,
} from "./index.js";
import { FakeDurableObjectSqlStorage } from "./sqliteFake.test-support.js";

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;
const many = () => "many" as const;
const cardinalityOf = (a: string) => (a === "worker.tag" ? "many" : "one");

class FakeAlarmStorage {
  alarmAt: number | null = null;
  setCalls: number[] = [];
  deleteCalls = 0;

  setAlarm(scheduledTime: number | Date): void {
    const value = scheduledTime instanceof Date
      ? scheduledTime.getTime()
      : scheduledTime;
    this.alarmAt = value;
    this.setCalls.push(value);
  }

  deleteAlarm(): void {
    this.alarmAt = null;
    this.deleteCalls += 1;
  }
}

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
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
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
    const active = await surface.appendAssert({
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

    expect(sql.projectionDeleteAllCount).toBe(0);
    expect(sql.projectionDeleteMatchingCount).toBeGreaterThan(0);

    expect(winner.projection).toMatchObject({
      events: 2,
      rows: 3,
    });
    expect(winner.projection.changed).toEqual([
      {
        e: "worker:maria",
        a: "worker.status",
        beforeEventIds: [active.event.id],
        afterEventIds: [winner.event.id],
      },
    ]);

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

    await expect(
      surface.query({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.status", "terminated"],
        ],
        select: ["?w"],
        coord,
      }),
    ).resolves.toMatchObject({
      rows: [{ w: "worker:maria" }],
    });
    await expect(
      surface.queryCurrent({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.status", "terminated"],
        ],
        select: ["?w"],
        coord,
      }),
    ).resolves.toMatchObject({
      rows: [{ w: "worker:maria" }],
    });

    const firstTag = await surface.page({
      where: [["worker:maria", "worker.tag", "?tag"]],
      select: ["?tag"],
      coord,
      paginationOpts: { numItems: 1 },
    });
    const secondTag = await surface.page({
      where: [["worker:maria", "worker.tag", "?tag"]],
      select: ["?tag"],
      coord,
      paginationOpts: { numItems: 1, cursor: firstTag.continueCursor },
    });
    expect(firstTag).toMatchObject({
      page: [{ tag: "remote" }],
      continueCursor: "1",
      isDone: false,
    });
    expect(secondTag).toMatchObject({
      page: [{ tag: "urgent" }],
      isDone: true,
    });
    const firstCurrentTag = await surface.pageCurrent({
      where: [["worker:maria", "worker.tag", "?tag"]],
      select: ["?tag"],
      coord,
      paginationOpts: { numItems: 1 },
    });
    const secondCurrentTag = await surface.pageCurrent({
      where: [["worker:maria", "worker.tag", "?tag"]],
      select: ["?tag"],
      coord,
      paginationOpts: {
        numItems: 1,
        cursor: firstCurrentTag.continueCursor,
      },
    });
    expect(firstCurrentTag).toMatchObject({
      page: [{ tag: "remote" }],
      continueCursor: "1",
      isDone: false,
    });
    expect(secondCurrentTag).toMatchObject({
      page: [{ tag: "urgent" }],
      isDone: true,
    });

    await expect(
      surface.aggregate({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.tag", "?tag"],
        ],
        coord,
        groupBy: ["?w"],
        aggregates: [{ op: "count", as: "tags" }],
      }),
    ).resolves.toEqual([{ w: "worker:maria", tags: 2 }]);
    await expect(
      surface.aggregateCurrent({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.tag", "?tag"],
        ],
        coord,
        groupBy: ["?w"],
        aggregates: [{ op: "count", as: "tags" }],
      }),
    ).resolves.toEqual([{ w: "worker:maria", tags: 2 }]);

    await expect(
      surface.derivedRows({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.status", "terminated"],
        ],
        coord,
        emit: { e: "?w", a: "worker.offboarded", v: true },
      }),
    ).resolves.toEqual([
      { e: "worker:maria", a: "worker.offboarded", v: true },
    ]);
    await expect(
      surface.derivedRowsCurrent({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.status", "terminated"],
        ],
        coord,
        emit: { e: "?w", a: "worker.offboarded", v: true },
      }),
    ).resolves.toEqual([
      { e: "worker:maria", a: "worker.offboarded", v: true },
    ]);

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

    await expect(surface.rebuildCurrent()).resolves.toMatchObject({
      events: 7,
      rows: 6,
      changed: [],
    });
    expect(sql.projectionDeleteAllCount).toBe(1);
  });

  test("current surface rebuilds lifecycle changes into empty current state", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
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

    const targetScansBefore = sql.eventTargetScanCount;
    const fullScansBefore = sql.eventFullScanCount;
    const retracted = await surface.appendLifecycle({
      kind: "retract",
      target: asserted.event.id,
      actor: "user:1",
      reason: "closed",
    });

    expect(retracted.projection).toEqual({
      events: 2,
      rows: 0,
      changed: [
        {
          e: "worker:closed",
          a: "worker.status",
          beforeEventIds: [asserted.event.id],
          afterEventIds: [],
        },
      ],
    });
    expect(sql.eventTargetScanCount).toBeGreaterThan(targetScansBefore);
    expect(sql.eventFullScanCount).toBe(fullScansBefore);
    await expect(surface.listEvents({ target: asserted.event.id })).resolves.toEqual([
      retracted.event,
    ]);
    await expect(surface.listCurrent({ e: "worker:closed" })).resolves.toEqual([]);
    await expect(
      surface.getCurrentEntity({ e: "worker:closed" }),
    ).resolves.toBeNull();
    expect(sql.projectionDeleteAllCount).toBe(0);
    expect(sql.projectionDeleteMatchingCount).toBeGreaterThan(0);
  });

  test("historical Datalog queries use indexed SQLite event scans with lifecycle visibility", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:indexed-query",
      wall: () => 550,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    await surface.appendAssert({
      e: "worker:indexed",
      a: "type",
      v: "Worker",
      actor: "user:1",
    });
    const active = await surface.appendAssert({
      e: "worker:indexed",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    await surface.appendLifecycle({
      kind: "retract",
      target: active.event.id,
      actor: "user:1",
    });
    await surface.appendAssert({
      e: "worker:indexed",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    await surface.appendAssert({
      e: "task:indexed",
      a: "type",
      v: "Task",
      actor: "user:1",
    });

    const fullScansBefore = sql.eventFullScanCount;
    const attributeScansBefore = sql.eventAttributeScanCount;
    const entityAttributeScansBefore = sql.eventEntityAttributeScanCount;
    const targetScansBefore = sql.eventTargetScanCount;

    await expect(
      surface.query({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.status", "terminated"],
        ],
        select: ["?w"],
        coord,
      }),
    ).resolves.toMatchObject({
      rows: [{ w: "worker:indexed" }],
    });
    await expect(
      surface.query({
        where: [["?w", "worker.status", "active"]],
        select: ["?w"],
        coord,
      }),
    ).resolves.toMatchObject({ rows: [] });

    expect(sql.eventFullScanCount).toBe(fullScansBefore);
    expect(sql.eventAttributeScanCount).toBeGreaterThan(attributeScansBefore);
    expect(sql.eventEntityAttributeScanCount).toBeGreaterThan(
      entityAttributeScansBefore,
    );
    expect(sql.eventTargetScanCount).toBeGreaterThan(targetScansBefore);
  });

  test("current surface persists collection capabilities over SQLite rows", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:collections",
      wall: () => 600,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    const issued = await surface.issueCollection({
      token: "collection:worker:maria:onboard",
      subject: "worker:maria",
      form: "forms:onboarding",
      expiresAt: 12_000,
      runId: "run:1",
      stepId: "step:collect",
      scope: "tenant:demo",
    });
    expect(issued).toEqual({
      token: "collection:worker:maria:onboard",
      subject: "worker:maria",
      form: "forms:onboarding",
      status: "issued",
      issuedAt: coord.txTime,
      expiresAt: 12_000,
      submittedAt: null,
      data: undefined,
      runId: "run:1",
      stepId: "step:collect",
      scope: "tenant:demo",
    });

    await expect(
      surface.collectionByToken({ token: "collection:worker:maria:onboard" }),
    ).resolves.toEqual(issued);
    await expect(
      surface.listCollections({
        subject: "worker:maria",
        status: "issued",
      }),
    ).resolves.toEqual([issued]);

    await surface.issueCollection({
      token: "collection:worker:ada:onboard",
      subject: "worker:ada",
      form: "forms:onboarding",
      issuedAt: 10_500,
    });
    await expect(
      surface.listCollections({ status: "issued" }),
    ).resolves.toHaveLength(2);

    const submitted = await surface.submitCollection({
      token: "collection:worker:maria:onboard",
      submittedAt: 11_000,
      data: { name: "Maria", acceptedPolicy: true },
    });
    expect(submitted).toEqual({
      collection: {
        token: "collection:worker:maria:onboard",
        subject: "worker:maria",
        form: "forms:onboarding",
        status: "submitted",
        issuedAt: coord.txTime,
        expiresAt: 12_000,
        submittedAt: 11_000,
        data: { name: "Maria", acceptedPolicy: true },
        runId: "run:1",
        stepId: "step:collect",
        scope: "tenant:demo",
      },
      assertions: [],
    });
    await expect(
      surface.listCollections({ status: "submitted" }),
    ).resolves.toEqual([submitted.collection]);
    await expect(
      surface.submitCollection({
        token: "collection:worker:maria:onboard",
        submittedAt: 11_500,
        data: { duplicate: true },
      }),
    ).rejects.toThrow(/already submitted/);

    const lowered = await surface.submitCollection({
      token: "collection:worker:ada:onboard",
      submittedAt: 11_100,
      data: { name: "Ada", status: "active" },
      assertions: [
        {
          a: "name",
          v: "Ada",
          actor: "user:collection",
          reason: "collection submission",
        },
        {
          a: "worker.status",
          v: "active",
          actor: "user:collection",
          reason: "collection submission",
        },
      ],
    });
    expect(lowered.collection).toMatchObject({
      token: "collection:worker:ada:onboard",
      subject: "worker:ada",
      status: "submitted",
      submittedAt: 11_100,
      data: { name: "Ada", status: "active" },
    });
    expect(lowered.assertions).toHaveLength(2);
    expect(lowered.assertions.map((result) => result.event)).toMatchObject([
      {
        kind: "assert",
        e: "worker:ada",
        a: "name",
        v: "Ada",
        actor: "user:collection",
      },
      {
        kind: "assert",
        e: "worker:ada",
        a: "worker.status",
        v: "active",
        actor: "user:collection",
      },
    ]);
    expect(lowered.assertions.map((result) => result.projection.changed)).toEqual([
      [
        {
          e: "worker:ada",
          a: "name",
          beforeEventIds: [],
          afterEventIds: [lowered.assertions[0]!.event.id],
        },
      ],
      [
        {
          e: "worker:ada",
          a: "worker.status",
          beforeEventIds: [],
          afterEventIds: [lowered.assertions[1]!.event.id],
        },
      ],
    ]);
    await expect(surface.getCurrentEntity({ e: "worker:ada" })).resolves.toMatchObject({
      e: "worker:ada",
      attributes: {
        name: ["Ada"],
        "worker.status": ["active"],
      },
    });
    await expect(
      surface.listEvents({ e: "worker:ada" }),
    ).resolves.toHaveLength(2);

    await expect(
      surface.collectionByToken({ token: "collection:worker:maria:onboard" }),
    ).resolves.toEqual({
      token: "collection:worker:maria:onboard",
      subject: "worker:maria",
      form: "forms:onboarding",
      status: "submitted",
      issuedAt: coord.txTime,
      expiresAt: 12_000,
      submittedAt: 11_000,
      data: { name: "Maria", acceptedPolicy: true },
      runId: "run:1",
      stepId: "step:collect",
      scope: "tenant:demo",
    });

    const expired = await surface.issueCollection({
      token: "collection:worker:expired:onboard",
      subject: "worker:expired",
      form: "forms:onboarding",
      expiresAt: 9_999,
    });
    expect(expired.status).toBe("issued");
    await expect(
      surface.submitCollection({
        token: "collection:worker:expired:onboard",
        submittedAt: 10_000,
        data: { late: true },
      }),
    ).rejects.toThrow(/expired/);
    await expect(
      surface.collectionByToken({ token: "collection:worker:expired:onboard" }),
    ).resolves.toMatchObject({
      token: "collection:worker:expired:onboard",
      status: "expired",
      expiredAt: 10_000,
      submittedAt: null,
      data: undefined,
    });
  });

  test("current surface records collection reminder and expiry ticks over SQLite rows", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:collection-ticks",
      wall: () => 700,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    await surface.issueCollection({
      token: "collection:worker:timer:onboard",
      subject: "worker:timer",
      form: "forms:onboarding",
      issuedAt: 10_000,
      expiresAt: 20_000,
    });

    const reminder = await surface.scheduleCollectionTick({
      id: "tick:worker:timer:reminder",
      token: "collection:worker:timer:onboard",
      phase: "reminder",
      fireAt: 12_000,
      scheduledAt: 10_000,
    });
    const escalation = await surface.scheduleCollectionTick({
      id: "tick:worker:timer:escalation",
      token: "collection:worker:timer:onboard",
      phase: "escalation",
      fireAt: 14_000,
      scheduledAt: 10_000,
    });
    await surface.scheduleCollectionTick({
      id: "tick:worker:timer:expire",
      token: "collection:worker:timer:onboard",
      phase: "expire",
      fireAt: 20_000,
      scheduledAt: 10_000,
    });

    expect(reminder).toEqual({
      id: "tick:worker:timer:reminder",
      token: "collection:worker:timer:onboard",
      phase: "reminder",
      fireAt: 12_000,
      status: "pending",
      scheduledAt: 10_000,
      firedAt: null,
    });
    await expect(
      surface.collectionTickById({ id: "tick:worker:timer:escalation" }),
    ).resolves.toEqual(escalation);
    await expect(
      surface.listCollectionTicks({ status: "pending", dueAt: 13_000 }),
    ).resolves.toEqual([reminder]);

    const reminded = await surface.fireCollectionTick({
      id: "tick:worker:timer:reminder",
      firedAt: 12_500,
    });
    expect(reminded.tick).toMatchObject({
      id: "tick:worker:timer:reminder",
      status: "fired",
      firedAt: 12_500,
    });
    expect(reminded.collection).toMatchObject({
      token: "collection:worker:timer:onboard",
      status: "issued",
      remindedAt: 12_500,
    });

    const escalated = await surface.fireCollectionTick({
      id: "tick:worker:timer:escalation",
      firedAt: 14_500,
    });
    expect(escalated.tick.status).toBe("fired");
    expect(escalated.collection).toMatchObject({
      token: "collection:worker:timer:onboard",
      status: "issued",
      remindedAt: 12_500,
      escalatedAt: 14_500,
    });

    const expired = await surface.fireCollectionTick({
      id: "tick:worker:timer:expire",
      firedAt: 20_000,
    });
    expect(expired.tick.status).toBe("fired");
    expect(expired.collection).toMatchObject({
      token: "collection:worker:timer:onboard",
      status: "expired",
      expiredAt: 20_000,
    });

    await expect(
      surface.submitCollection({
        token: "collection:worker:timer:onboard",
        submittedAt: 20_100,
        data: { late: true },
      }),
    ).rejects.toThrow(/expired/);
    await expect(
      surface.listCollectionTicks({ status: "fired" }),
    ).resolves.toHaveLength(3);
  });

  test("collection ticks no-op after submission", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:collection-tick-noop",
      wall: () => 800,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    await surface.issueCollection({
      token: "collection:worker:done:onboard",
      subject: "worker:done",
      form: "forms:onboarding",
      issuedAt: 10_000,
    });
    await surface.scheduleCollectionTick({
      id: "tick:worker:done:reminder",
      token: "collection:worker:done:onboard",
      phase: "reminder",
      fireAt: 12_000,
    });
    await surface.submitCollection({
      token: "collection:worker:done:onboard",
      submittedAt: 11_000,
      data: { done: true },
    });

    const skipped = await surface.fireCollectionTick({
      id: "tick:worker:done:reminder",
      firedAt: 12_000,
    });
    expect(skipped.tick).toMatchObject({
      id: "tick:worker:done:reminder",
      status: "skipped",
      firedAt: 12_000,
      reason: "collection submitted",
    });
    expect(skipped.collection).toMatchObject({
      token: "collection:worker:done:onboard",
      status: "submitted",
    });
    await expect(
      surface.collectionByToken({ token: "collection:worker:done:onboard" }),
    ).resolves.not.toHaveProperty("remindedAt");
  });

  test("alarm multiplexer drains due collection ticks and re-arms the next alarm", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:alarm-mux",
      wall: () => 850,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });
    const alarms = new FakeAlarmStorage();
    const mux = createDurableObjectSqliteAlarmMultiplexer(alarms, surface, {
      now: () => 12_000,
    });

    await surface.issueCollection({
      token: "collection:worker:alarm:onboard",
      subject: "worker:alarm",
      form: "forms:onboarding",
      issuedAt: 10_000,
      expiresAt: 20_000,
    });
    await surface.scheduleCollectionTick({
      id: "tick:worker:alarm:expire",
      token: "collection:worker:alarm:onboard",
      phase: "expire",
      fireAt: 20_000,
      scheduledAt: 10_000,
    });
    await surface.scheduleCollectionTick({
      id: "tick:worker:alarm:reminder",
      token: "collection:worker:alarm:onboard",
      phase: "reminder",
      fireAt: 12_000,
      scheduledAt: 10_000,
    });
    await surface.scheduleCollectionTick({
      id: "tick:worker:alarm:escalation",
      token: "collection:worker:alarm:onboard",
      phase: "escalation",
      fireAt: 14_000,
      scheduledAt: 10_000,
    });

    await expect(mux.arm()).resolves.toMatchObject({
      nextAlarmAt: 12_000,
      nextTick: { id: "tick:worker:alarm:reminder" },
    });
    expect(alarms.alarmAt).toBe(12_000);

    const drained = await mux.drain();
    expect(drained).toMatchObject({
      dueAt: 12_000,
      fired: [
        {
          tick: {
            id: "tick:worker:alarm:reminder",
            status: "fired",
            firedAt: 12_000,
          },
        },
      ],
      rearm: {
        nextAlarmAt: 14_000,
        nextTick: { id: "tick:worker:alarm:escalation" },
      },
    });
    expect(alarms.setCalls).toEqual([12_000, 14_000]);
    await expect(
      surface.collectionByToken({ token: "collection:worker:alarm:onboard" }),
    ).resolves.toMatchObject({
      status: "issued",
      remindedAt: 12_000,
    });

    const laterMux = createDurableObjectSqliteAlarmMultiplexer(alarms, surface, {
      now: () => 25_000,
    });
    const later = await laterMux.drain();
    expect(later.fired.map((result) => result.tick.id)).toEqual([
      "tick:worker:alarm:escalation",
      "tick:worker:alarm:expire",
    ]);
    expect(later.rearm).toEqual({ nextAlarmAt: null });
    expect(alarms.alarmAt).toBe(null);
    expect(alarms.deleteCalls).toBe(1);
    await expect(
      surface.collectionByToken({ token: "collection:worker:alarm:onboard" }),
    ).resolves.toMatchObject({
      status: "expired",
      remindedAt: 12_000,
      escalatedAt: 25_000,
      expiredAt: 25_000,
    });
  });

  test("current surface persists and fires flow-wait ticks over SQLite rows", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:flow-wait",
      wall: () => 875,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    await surface.recordDagRun({
      runId: "dag:worker:wait:1",
      flowDefName: "owned_flow",
      subject: "worker:wait",
      status: "waiting",
      currentStepId: "sleep",
      context: { waited: false },
      now: 30_000,
      events: [
        {
          eventId: "dag:event:worker:wait:1:entered",
          stepId: "sleep",
          type: "timer",
          kind: "wait-entered",
        },
      ],
    });

    const scheduled = await surface.scheduleFlowWaitTick({
      id: "flow-wait:worker:wait:1:sleep",
      runId: "dag:worker:wait:1",
      stepId: "sleep",
      eventId: "dag:event:worker:wait:1:woke",
      fireAt: 35_000,
      scheduledAt: 30_000,
    });
    expect(scheduled).toEqual({
      id: "flow-wait:worker:wait:1:sleep",
      runId: "dag:worker:wait:1",
      stepId: "sleep",
      eventId: "dag:event:worker:wait:1:woke",
      fireAt: 35_000,
      status: "pending",
      scheduledAt: 30_000,
      firedAt: null,
    });
    await expect(
      surface.listFlowWaitTicks({ status: "pending", dueAt: 35_000 }),
    ).resolves.toEqual([scheduled]);

    const fired = await surface.fireFlowWaitTick({
      id: "flow-wait:worker:wait:1:sleep",
      firedAt: 35_000,
    });
    expect(fired.tick).toMatchObject({
      id: "flow-wait:worker:wait:1:sleep",
      status: "fired",
      firedAt: 35_000,
    });
    expect(fired.run).toMatchObject({
      runId: "dag:worker:wait:1",
      status: "running",
      currentStepId: "sleep",
      updatedAt: 35_000,
    });
    expect(fired.run?.events.map((event) => event.kind)).toEqual([
      "wait-entered",
      "flow-wait",
    ]);

    await surface.scheduleFlowWaitTick({
      id: "flow-wait:worker:wait:1:already-running",
      runId: "dag:worker:wait:1",
      stepId: "sleep",
      eventId: "dag:event:worker:wait:1:already-running",
      fireAt: 36_000,
      scheduledAt: 35_000,
    });
    await expect(
      surface.fireFlowWaitTick({
        id: "flow-wait:worker:wait:1:already-running",
        firedAt: 36_000,
      }),
    ).resolves.toMatchObject({
      tick: {
        id: "flow-wait:worker:wait:1:already-running",
        status: "skipped",
        firedAt: 36_000,
        reason: "DAG run running",
      },
      run: { status: "running" },
    });
  });

  test("alarm multiplexer drains flow-wait ticks before later collection ticks", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:flow-wait-alarm",
      wall: () => 890,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });
    const alarms = new FakeAlarmStorage();

    await surface.recordDagRun({
      runId: "dag:worker:flow-alarm:1",
      flowDefName: "owned_flow",
      subject: "worker:flow-alarm",
      status: "waiting",
      currentStepId: "pause",
      now: 40_000,
      events: [],
    });
    await surface.scheduleFlowWaitTick({
      id: "flow-wait:worker:flow-alarm:pause",
      runId: "dag:worker:flow-alarm:1",
      stepId: "pause",
      eventId: "dag:event:worker:flow-alarm:woke",
      fireAt: 42_000,
      scheduledAt: 40_000,
    });
    await surface.issueCollection({
      token: "collection:worker:flow-alarm:onboard",
      subject: "worker:flow-alarm",
      form: "forms:onboarding",
      issuedAt: 40_000,
      expiresAt: 45_000,
    });
    await surface.scheduleCollectionTick({
      id: "tick:worker:flow-alarm:expire",
      token: "collection:worker:flow-alarm:onboard",
      phase: "expire",
      fireAt: 45_000,
      scheduledAt: 40_000,
    });

    const mux = createDurableObjectSqliteAlarmMultiplexer(alarms, surface, {
      now: () => 42_000,
    });
    await expect(mux.arm()).resolves.toMatchObject({
      nextAlarmAt: 42_000,
      nextTickKind: "flow-wait",
      nextTick: { id: "flow-wait:worker:flow-alarm:pause" },
    });

    const drained = await mux.drain();
    expect(drained.fired).toHaveLength(1);
    expect(drained.fired[0]).toMatchObject({
      kind: "flow-wait",
      tick: {
        id: "flow-wait:worker:flow-alarm:pause",
        status: "fired",
        firedAt: 42_000,
      },
      run: { status: "running" },
    });
    expect(drained.rearm).toMatchObject({
      nextAlarmAt: 45_000,
      nextTickKind: "collection",
      nextTick: { id: "tick:worker:flow-alarm:expire" },
    });
    expect(alarms.setCalls).toEqual([42_000, 45_000]);
  });

  test("current surface persists DAG run timelines over SQLite rows", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:dag",
      wall: () => 900,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    const first = await surface.recordDagRun({
      runId: "dag:worker:flow:1",
      flowDefName: "owned_flow",
      subject: "worker:dag",
      status: "waiting",
      currentStepId: "collect",
      context: { employer: "employer:acme" },
      now: 50_000,
      events: [
        {
          eventId: "dag:event:worker:flow:1:collect-issued",
          stepId: "collect",
          type: "collect",
          kind: "collect-issued",
          message: "owned_i9 for employer:acme",
        },
      ],
    });
    expect(first).toEqual({
      runId: "dag:worker:flow:1",
      flowDefName: "owned_flow",
      subject: "worker:dag",
      status: "waiting",
      currentStepId: "collect",
      startedAt: 50_000,
      updatedAt: 50_000,
      context: { employer: "employer:acme" },
      events: [
        {
          eventId: "dag:event:worker:flow:1:collect-issued",
          runId: "dag:worker:flow:1",
          ts: 50_000,
          stepId: "collect",
          type: "collect",
          kind: "collect-issued",
          message: "owned_i9 for employer:acme",
        },
      ],
    });

    const second = await surface.recordDagRun({
      flowDefName: "owned_flow",
      subject: "worker:dag",
      status: "completed",
      currentStepId: "done",
      context: { employer: "employer:acme", accepted: true },
      now: 51_000,
      events: [
        {
          eventId: "dag:event:worker:flow:1:collect-satisfied",
          stepId: "collect",
          type: "collect",
          kind: "collect-satisfied",
        },
        {
          eventId: "dag:event:worker:flow:1:completed",
          stepId: "done",
          type: "done",
          kind: "completed",
        },
      ],
    });
    expect(second).toMatchObject({
      runId: "dag:worker:flow:1",
      status: "completed",
      currentStepId: "done",
      updatedAt: 51_000,
      completedAt: 51_000,
      context: { employer: "employer:acme", accepted: true },
    });
    expect(second.events.map((event) => event.kind)).toEqual([
      "collect-issued",
      "collect-satisfied",
      "completed",
    ]);

    await expect(surface.getDagRun({ runId: "dag:worker:flow:1" })).resolves.toEqual(
      second,
    );
    await expect(
      surface.listDagRuns({ subject: "worker:dag", status: "completed" }),
    ).resolves.toEqual([second]);
  });

  test("DAG run creation requires caller-provided run ids", async () => {
    const sql = new FakeDurableObjectSqlStorage();
    const runtime = await createDurableObjectSqliteRuntime({
      sql,
      replicaId: "do-sqlite:dag-id",
      wall: () => 950,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    await expect(
      surface.recordDagRun({
        flowDefName: "owned_flow",
        subject: "worker:new-dag",
        status: "running",
        now: 52_000,
        events: [],
      }),
    ).rejects.toThrow(/runId required/);
  });
});
