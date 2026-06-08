import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import { applyOperation, versionVector } from "@metacrdt/runtime";
import {
  runRuntimeConformance,
  type RuntimeConformanceTarget,
  type RuntimeFactoryOptions,
} from "@metacrdt/testkit";
import {
  createNodeMemoryRuntime,
  createNodeSqliteRuntime,
  type NodeSqliteDatabaseLike,
  type NodeSqliteStatementLike,
} from "./index.js";

type EventRow = {
  id: string;
  e: string | null;
  a: string | null;
  event_json: string;
};

class FakeSqliteDatabase implements NodeSqliteDatabaseLike {
  readonly events = new Map<string, EventRow>();
  readonly meta = new Map<string, string>();

  exec(): void {}

  prepare(sql: string): NodeSqliteStatementLike {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    return {
      run: (...params: readonly unknown[]) => {
        if (normalized.startsWith("insert into") && normalized.includes("event_json")) {
          const [id, e, a, eventJson] = params;
          if (typeof id !== "string" || typeof eventJson !== "string") {
            throw new Error("bad event insert params");
          }
          if (!this.events.has(id)) {
            this.events.set(id, {
              id,
              e: typeof e === "string" ? e : null,
              a: typeof a === "string" ? a : null,
              event_json: eventJson,
            });
          }
          return;
        }
        if (normalized.startsWith("update") && normalized.includes("event_json")) {
          const [eventJson, id] = params;
          if (typeof id !== "string" || typeof eventJson !== "string") {
            throw new Error("bad event update params");
          }
          const existing = this.events.get(id);
          if (existing) this.events.set(id, { ...existing, event_json: eventJson });
          return;
        }
        if (normalized.startsWith("insert or replace") && normalized.includes("value")) {
          const [key, value] = params;
          if (typeof key !== "string" || typeof value !== "string") {
            throw new Error("bad meta upsert params");
          }
          this.meta.set(key, value);
        }
      },
      get: (...params: readonly unknown[]) => {
        if (normalized.startsWith("select event_json")) {
          const [id] = params;
          return typeof id === "string" ? this.events.get(id) : undefined;
        }
        if (normalized.startsWith("select value")) {
          const [key] = params;
          const value = typeof key === "string" ? this.meta.get(key) : undefined;
          return value === undefined ? undefined : { value };
        }
        return undefined;
      },
      all: (...params: readonly unknown[]) => {
        let rows = [...this.events.values()];
        if (normalized.includes("where e = ? and a = ?")) {
          const [e, a] = params;
          rows = rows.filter((row) => row.e === e && row.a === a);
        } else if (normalized.includes("where e = ?")) {
          const [e] = params;
          rows = rows.filter((row) => row.e === e);
        } else if (normalized.includes("where a = ?")) {
          const [a] = params;
          rows = rows.filter((row) => row.a === a);
        }
        return rows.sort((a, b) => a.id.localeCompare(b.id));
      },
    };
  }
}

const memoryTarget: RuntimeConformanceTarget = {
  name: "node-memory",
  createRuntime(options: RuntimeFactoryOptions) {
    return createNodeMemoryRuntime({
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const sqliteTarget: RuntimeConformanceTarget = {
  name: "node-sqlite",
  createRuntime(options: RuntimeFactoryOptions) {
    return createNodeSqliteRuntime({
      db: new FakeSqliteDatabase(),
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;

describe("@metacrdt/node target", () => {
  test("node memory runtime passes shared conformance", async () => {
    await expect(runRuntimeConformance(memoryTarget)).resolves.toMatchObject({
      target: "node-memory",
      checks: expect.arrayContaining([
        "append-idempotent",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
      ]),
    });
  });

  test("node SQLite runtime passes shared conformance", async () => {
    await expect(runRuntimeConformance(sqliteTarget)).resolves.toMatchObject({
      target: "node-sqlite",
      checks: expect.arrayContaining([
        "append-idempotent",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
      ]),
    });
  });

  test("SQLite runtime persists event log, HLC, and seq across recreation", async () => {
    const db = new FakeSqliteDatabase();
    const first = await createNodeSqliteRuntime({
      db,
      replicaId: "node:sqlite",
      wall: () => 500,
    });
    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(active.seq).toBe(1);

    const second = await createNodeSqliteRuntime({
      db,
      replicaId: "node:sqlite",
      wall: () => 500,
    });
    expect(second.clock.current()).toEqual({ pt: 500, l: 0, r: "node:sqlite" });
    expect(second.sequencer.current()).toBe(1);
    expect(await second.store.get(active.id)).toEqual(active);

    const terminated = await applyOperation(second, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(terminated.seq).toBe(2);
    expect(terminated.hlc).toEqual({ pt: 500, l: 1, r: "node:sqlite" });

    const third = await createNodeSqliteRuntime({
      db,
      replicaId: "node:sqlite",
      wall: () => 500,
    });
    const log = fromEvents(await third.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
    expect(versionVector(await third.store.scan())).toEqual({ "node:sqlite": 2 });
  });
});
