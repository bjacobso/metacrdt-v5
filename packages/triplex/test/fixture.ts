import { Effect, Layer } from "effect";
import { EntityId, KvTriples, ref, Triples } from "@bjacobso/triplex";
import { Attribute, ConfigStore, EntityType } from "@bjacobso/triplex/config";
import * as Derivation from "@bjacobso/triplex/derivation";
import { collectionNode, createCoordinator, prepareSubmission } from "../src/index.js";

export const day = 86_400_000;
export const worker = EntityId.make("worker:maria");
export const site = EntityId.make("site:harbor");
export const evidenceAttribute = ":evidence/safety";
export const consumer = "site-safety/v1";
export const layer = ConfigStore.layer.pipe(Layer.provideMerge(KvTriples.layerWithScope("test/coordination")));

export const fixture = Effect.gen(function* () {
  const triples = yield* Triples;
  const config = yield* ConfigStore.ConfigStore;
  const evidence = Attribute.ref(evidenceAttribute, { entityType: "Site" });
  const form = yield* collectionNode({
    form: "safety", title: "Safety training", evidenceAttribute, validityDays: 1,
    fields: [{ name: "certificate", label: "Certificate number", type: "string", required: true }],
  });
  const attribute = yield* evidence.node;
  const siteSchema = yield* EntityType.make("Site", { attributes: {} }).node;
  const release = yield* config.commit({ label: "safety-v1", objects: [siteSchema, attribute, form], ref: "live" });
  const definition = yield* Derivation.make({
    name: "require.safety", configSnapshot: release.snapshot.id,
    identity: ["?worker", "?site"],
    query: {
      find: ["?worker", "?site"],
      where: [
        ["?placement", ":placement/worker", "?worker"],
        ["?placement", ":placement/site", "?site"],
        ["not", ["?worker", evidenceAttribute, "?site"]],
      ],
    },
  });
  const coordinator = createCoordinator(triples, { consumer, definition });
  const place = (id = "placement:one", at = day) => triples.transact([
    { op: "assert", entityId: EntityId.make(id), attribute: ":placement/worker", value: ref(worker), validFrom: at },
    { op: "assert", entityId: EntityId.make(id), attribute: ":placement/site", value: ref(site), validFrom: at },
  ], { actor: "test/placement", commandId: id, configSnapshot: release.snapshot.id });
  const prepare = (id = "submission:one", at = day * 2) => prepareSubmission(release.snapshot, "safety", {
    id, subject: worker, scope: site, validAt: at, values: { certificate: "CERT-123" },
  });
  const submit = (id = "submission:one", at = day * 2) => Effect.gen(function* () {
    const plan = yield* prepare(id, at);
    return yield* triples.transact(plan.operations, {
      actor: "test/submit", commandId: id, configSnapshot: plan.configSnapshot,
    });
  });
  return { triples, config, release, definition, coordinator, place, prepare, submit };
});
