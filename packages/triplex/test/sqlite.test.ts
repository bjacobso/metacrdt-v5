import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { Triples } from "@bjacobso/triplex";
import { ConfigStore } from "@bjacobso/triplex/config";
import { SqliteTriples } from "@bjacobso/triplex-sqlite";
import { createCoordinator } from "../src/index.js";
import { consumer, day, fixture } from "./fixture.js";

test("SQLite retains work and its expiry wakeup across closing and reopening the database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metacrdt-triplex-"));
  const filename = join(directory, "coordination.sqlite");
  try {
    const definition = await Effect.runPromise(Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.place();
      yield* f.coordinator.poll(day);
      yield* f.submit();
      yield* f.coordinator.poll(day * 2);
      return f.definition;
    }).pipe(Effect.provide(ConfigStore.layer.pipe(Layer.provideMerge(SqliteTriples.layer({ filename }))))));

    // A fresh Effect layer opens a new SQL connection after the first was closed.
    await Effect.runPromise(Effect.gen(function* () {
      const triples = yield* Triples;
      const coordinator = createCoordinator(triples, { consumer, definition });
      expect((yield* coordinator.state())?.nextWakeupAt).toBe(day * 3);
      expect((yield* coordinator.requirements())[0]?.status).toBe("resolved");
      yield* coordinator.poll(day * 3);
      const records = [...yield* coordinator.requirements()].sort((a, b) => a.occurrence - b.occurrence);
      expect(records.map((record) => record.status)).toEqual(["resolved", "open"]);
      yield* coordinator.poll(day * 3);
      expect(yield* coordinator.requirements()).toHaveLength(2);
    }).pipe(Effect.provide(SqliteTriples.layer({ filename }))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
