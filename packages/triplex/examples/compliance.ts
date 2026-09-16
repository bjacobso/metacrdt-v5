import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { EntityId, ref, Triples } from "@bjacobso/triplex";
import { Attribute, ConfigStore, EntityType } from "@bjacobso/triplex/config";
import * as Derivation from "@bjacobso/triplex/derivation";
import { SqliteTriples } from "@bjacobso/triplex-sqlite";
import { collectionNode, createCoordinator, prepareSubmission, previewSubmission } from "../src/index.js";

const day = 86_400_000;
const worker = EntityId.make("worker:maria");
const site = EntityId.make("site:harbor");
const consumer = "safety-training/v1";
const directory = await mkdtemp(join(tmpdir(), "metacrdt-triplex-demo-"));
const filename = join(directory, "work.sqlite");

try {
  const first = await Effect.runPromise(Effect.gen(function* () {
    const triples = yield* Triples;
    const config = yield* ConfigStore.ConfigStore;
    const Site = EntityType.make("Site", { attributes: {} });
    const evidence = Attribute.ref(":evidence/safety", Site);
    const form = yield* collectionNode({
      form: "safety-training", title: "Safety training", evidenceAttribute: evidence.key,
      validityDays: 1,
      fields: [{ name: "certificate", label: "Certificate number", type: "string", required: true }],
    });
    const release = yield* config.commit({
      label: "safety-2026.1", ref: "live", objects: [yield* Site.node, yield* evidence.node, form],
    });
    const definition = yield* Derivation.make({
      name: "require.safety-training", configSnapshot: release.snapshot.id,
      identity: ["?worker", "?site"],
      query: {
        find: ["?worker", "?site"],
        where: [
          ["?placement", ":placement/worker", "?worker"],
          ["?placement", ":placement/site", "?site"],
          ["not", ["?worker", evidence.key, "?site"]],
        ],
      },
    });
    yield* triples.transact([
      { op: "assert", entityId: EntityId.make("placement:one"), attribute: ":placement/worker", value: ref(worker), validFrom: day },
      { op: "assert", entityId: EntityId.make("placement:one"), attribute: ":placement/site", value: ref(site), validFrom: day },
    ], { actor: "demo/placement", commandId: "placement:one", configSnapshot: release.snapshot.id });
    const coordinator = createCoordinator(triples, { consumer, definition });
    yield* coordinator.poll(day);
    const opened = yield* coordinator.requirements();
    const submission = {
      id: "submission:one", subject: worker, scope: site,
      validAt: day * 2, values: { certificate: "CERT-123" },
    };
    const beforePreview = yield* triples.currentPosition();
    const preview = yield* previewSubmission(triples, definition, release.snapshot, "safety-training", submission);
    if (preview.candidates.length !== 0 || (yield* triples.currentPosition()) !== beforePreview) {
      throw new Error("Submission preview must satisfy the derivation without writing facts");
    }
    const prepared = yield* prepareSubmission(release.snapshot, "safety-training", submission);
    yield* triples.transact(prepared.operations, {
      actor: "demo/collection", commandId: submission.id, configSnapshot: prepared.configSnapshot,
    });
    const resolved = yield* coordinator.poll(day * 2);
    if (opened.length !== 1 || (yield* coordinator.requirements())[0]?.status !== "resolved" ||
        resolved.nextWakeupAt !== day * 3) throw new Error("Expected resolved work with a durable expiry wakeup");
    return { definition, release: release.snapshot.id, wakeup: resolved.nextWakeupAt };
  }).pipe(Effect.provide(ConfigStore.layer.pipe(Layer.provideMerge(SqliteTriples.layer({ filename }))))));

  // The first database connection and Effect runtime are now closed. This host
  // recovers its timer from persisted state; no new evidence/placement is written.
  const occurrences = await Effect.runPromise(Effect.gen(function* () {
    const triples = yield* Triples;
    const coordinator = createCoordinator(triples, { consumer, definition: first.definition });
    yield* coordinator.poll(first.wakeup);
    const requirements = [...yield* coordinator.requirements()].sort((a, b) => a.occurrence - b.occurrence);
    if (requirements.length !== 2 || requirements[0]?.status !== "resolved" || requirements[1]?.status !== "open") {
      throw new Error("Expiry must reopen a new occurrence and retain the first");
    }
    return requirements;
  }).pipe(Effect.provide(SqliteTriples.layer({ filename }))));

  console.log("MetaCRDT coordination on Triplex (SQLite)");
  console.log("Release:", first.release);
  console.log("Submission preview: satisfies training requirement; no writes");
  console.log("Restart: recovered expiry wakeup from the database");
  console.table(occurrences.map(({ occurrence, status, openedAt, resolvedAt }) => ({
    occurrence, status, openedOnDay: openedAt / day, resolvedOnDay: resolvedAt === null ? null : resolvedAt / day,
  })));
} finally {
  await rm(directory, { recursive: true, force: true });
}
