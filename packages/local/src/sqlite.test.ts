import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import { applyOperation, versionVector } from "@metacrdt/runtime";
import {
  createSqliteLocalFirstRuntime,
  sqliteStorage,
  startSqliteLocalFirstRuntime,
  type BrowserBroadcastChannelLike,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "./index.js";

class FakeSqlite implements SqliteDatabaseLike {
  readonly data = new Map<string, string>();
  readonly execSql: string[] = [];
  readonly preparedSql: string[] = [];

  async exec(sql: string): Promise<void> {
    this.execSql.push(sql);
  }

  async prepare(sql: string): Promise<SqliteStatementLike> {
    this.preparedSql.push(sql);
    return {
      get: async (...params: readonly unknown[]) => {
        if (!sql.startsWith("SELECT value FROM")) {
          throw new Error(`unexpected get SQL: ${sql}`);
        }
        const value = this.data.get(String(params[0]));
        return value === undefined ? undefined : { value };
      },
      run: async (...params: readonly unknown[]) => {
        if (sql.startsWith("INSERT OR REPLACE INTO")) {
          this.data.set(String(params[0]), String(params[1]));
          return;
        }
        if (sql.startsWith("DELETE FROM")) {
          this.data.delete(String(params[0]));
          return;
        }
        if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return;
        throw new Error(`unexpected run SQL: ${sql}`);
      },
    };
  }
}

class BroadcastBus {
  readonly channels = new Set<FakeBroadcastChannel>();
}

class FakeBroadcastChannel implements BrowserBroadcastChannelLike {
  readonly listeners = new Set<(event: { data: unknown }) => void>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(private readonly bus: BroadcastBus) {
    bus.channels.add(this);
  }

  postMessage(message: unknown): void {
    for (const channel of this.bus.channels) {
      if (channel === this || channel.closed) continue;
      queueMicrotask(() => channel.deliver(message));
    }
  }

  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void {
    if (type === "message") this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.bus.channels.delete(this);
  }

  deliver(data: unknown): void {
    const event = { data };
    this.onmessage?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;

describe("@metacrdt/local SQLite storage", () => {
  test("adapts a SQLite prepare/get/run client to async key/value storage", async () => {
    const db = new FakeSqlite();
    const storage = await sqliteStorage({ db, tableName: "metacrdt_test" });

    expect(db.execSql).toEqual([
      'CREATE TABLE IF NOT EXISTS "metacrdt_test" (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
    ]);
    await storage.setItem("a", "1");
    await storage.setItem("b", "2");
    expect(await storage.getItem("a")).toBe("1");
    await storage.removeItem("a");
    expect(await storage.getItem("a")).toBeNull();
    expect(await storage.getItem("b")).toBe("2");
  });

  test("rejects unsafe table names", async () => {
    await expect(
      sqliteStorage({ db: new FakeSqlite(), tableName: "kv; drop table facts" }),
    ).rejects.toThrow(/invalid SQLite table name/);
  });

  test("persists runtime event log, HLC, and seq over SQLite storage", async () => {
    const db = new FakeSqlite();
    const first = await createSqliteLocalFirstRuntime({
      sqlite: { db },
      namespace: "sqlite",
      replicaId: "sqlite:a",
      wall: () => 1_300,
      broadcast: false,
    });

    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    first.stop();

    const second = await createSqliteLocalFirstRuntime({
      sqlite: { db },
      namespace: "sqlite",
      replicaId: "sqlite:a",
      wall: () => 1_300,
      broadcast: false,
    });
    expect(await second.store.get(active.id)).toEqual(active);
    expect(second.clock.current()).toEqual({ pt: 1_300, l: 0, r: "sqlite:a" });
    expect(second.sequencer.current()).toBe(1);

    const log = fromEvents(await second.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "active",
    );
  });

  test("SQLite local-first runtimes converge over BroadcastChannel", async () => {
    const bus = new BroadcastBus();
    const left = await startSqliteLocalFirstRuntime({
      sqlite: { db: new FakeSqlite() },
      channel: new FakeBroadcastChannel(bus),
      namespace: "sqlite-sync",
      replicaId: "sqlite:left",
      wall: () => 1_400,
      announceOnStart: false,
    });
    const right = await startSqliteLocalFirstRuntime({
      sqlite: { db: new FakeSqlite() },
      channel: new FakeBroadcastChannel(bus),
      namespace: "sqlite-sync",
      replicaId: "sqlite:right",
      wall: () => 1_400,
      announceOnStart: false,
    });

    const event = await applyOperation(left, {
      op: "assert",
      e: "task:1",
      a: "status",
      v: "ready",
      actor: "alice",
    });
    await flush();

    expect(right.profile.capabilities.has("transport")).toBe(true);
    expect(await right.store.get(event.id)).toEqual(event);
    expect(versionVector(await right.store.scan())).toEqual({ "sqlite:left": 1 });
    left.stop();
    right.stop();
  });
});
