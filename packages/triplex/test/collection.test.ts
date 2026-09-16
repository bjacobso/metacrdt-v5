import { expect, test } from "vitest";
import { Effect, Exit } from "effect";
import { collectionNode, prepareSubmission, previewSubmission } from "../src/index.js";
import { day, evidenceAttribute, fixture, layer, site, worker } from "./fixture.js";

test("submission validation uses the pinned published form and preserves typed values", () => Effect.runPromise(
  Effect.gen(function* () {
    const f = yield* fixture;
    const position = yield* f.triples.currentPosition();
    const invalid = yield* Effect.exit(prepareSubmission(f.release.snapshot, "safety", {
      id: "invalid", subject: worker, scope: site, validAt: day, values: { unexpected: "x" },
    }));
    expect(Exit.isFailure(invalid)).toBe(true);
    expect(yield* f.triples.currentPosition()).toBe(position);

    const node = yield* collectionNode({
      form: "safety", title: "Updated training", evidenceAttribute,
      fields: [{ name: "passed", label: "Passed?", type: "boolean", required: true }],
    });
    const objects = f.release.snapshot.root.children.map((child) => child.node)
      .filter((child) => child.kind !== "metacrdt.collection");
    const updated = yield* f.config.commit({ label: "safety-v2", objects: [...objects, node], ref: "live" });
    // Moving live does not change validation of the release pinned by existing work.
    const old = yield* f.prepare();
    expect(old.configSnapshot).toBe(f.release.snapshot.id);
    expect(Exit.isFailure(yield* Effect.exit(prepareSubmission(updated.snapshot, "safety", {
      id: "wrong-form", subject: worker, scope: site, validAt: day, values: { certificate: "old" },
    })))).toBe(true);
    const next = yield* prepareSubmission(updated.snapshot, "safety", {
      id: "typed", subject: worker, scope: site, validAt: day, values: { passed: false },
    });
    expect(next.assertions[0]?.value).toMatchObject({ type: "json", value: { values: { passed: false } } });
    expect(Exit.isFailure(yield* Effect.exit(previewSubmission(f.triples, f.definition, updated.snapshot, "safety", {
      id: "mismatch", subject: worker, scope: site, validAt: day, values: { passed: true },
    })))).toBe(true);
  }).pipe(Effect.provide(layer)),
));

test("form definitions reject duplicate fields and invalid expiry", async () => {
  for (const definition of [
    { validityDays: -1, fields: [] },
    { fields: [
      { name: "x", label: "First", type: "string" as const },
      { name: "x", label: "Second", type: "string" as const },
    ] },
  ]) {
    const exit = await Effect.runPromise(Effect.exit(collectionNode({
      form: "invalid", title: "Invalid", evidenceAttribute, ...definition,
    })));
    expect(Exit.isFailure(exit)).toBe(true);
  }
});
