import { Data, Effect, Schema } from "effect";
import { EntityId, type TransactOp, type TripleInput, type TriplesService } from "@bjacobso/triplex";
import * as Derivation from "@bjacobso/triplex/derivation";
import { ConfigNode, ConfigStore, TypeExpr } from "@bjacobso/triplex/config";
import { CanonicalJson, ContentId } from "@bjacobso/triplex/content";
import { DAY_MS, validateSubmission, type FormDef, type ValidationError } from "@metacrdt/collect";

const Field = Schema.Struct({
  name: Schema.String, label: Schema.String,
  type: Schema.Literals(["string", "number", "boolean", "date", "select"]),
  required: Schema.optional(Schema.Boolean), options: Schema.optional(Schema.Array(Schema.String)),
  pii: Schema.optional(Schema.Boolean), sensitive: Schema.optional(Schema.Boolean),
});
const CollectionSchema = Schema.Struct({
  form: Schema.String, title: Schema.String, fields: Schema.Array(Field),
  validityDays: Schema.optional(Schema.Number), evidenceAttribute: Schema.String,
});
export type CollectionDefinition = FormDef & { readonly evidenceAttribute: string };

const CollectionType = TypeExpr.struct({
  form: TypeExpr.required(TypeExpr.text), title: TypeExpr.required(TypeExpr.text),
  fields: TypeExpr.required(TypeExpr.list(TypeExpr.struct({
    name: TypeExpr.required(TypeExpr.text), label: TypeExpr.required(TypeExpr.text),
    type: TypeExpr.required(TypeExpr.enumOf(["string", "number", "boolean", "date", "select"])),
    required: TypeExpr.optional(TypeExpr.boolean), options: TypeExpr.optional(TypeExpr.list(TypeExpr.text)),
    pii: TypeExpr.optional(TypeExpr.boolean), sensitive: TypeExpr.optional(TypeExpr.boolean),
  }))),
  validityDays: TypeExpr.optional(TypeExpr.number), evidenceAttribute: TypeExpr.required(TypeExpr.text),
});

export class CollectionError extends Data.TaggedError("CollectionError")<{
  readonly message: string;
  readonly fields?: readonly ValidationError[];
}> {}

const decodeDefinition = (input: unknown) => Effect.gen(function* () {
  const definition = yield* Schema.decodeUnknownEffect(CollectionSchema)(input);
  if (!definition.form || !definition.evidenceAttribute.startsWith(":") ||
      definition.evidenceAttribute.startsWith(":metacrdt/") ||
      new Set(definition.fields.map((field) => field.name)).size !== definition.fields.length ||
      definition.fields.some((field) => !field.name || ["__proto__", "constructor", "prototype"].includes(field.name)) ||
      (definition.validityDays !== undefined &&
        (!Number.isFinite(definition.validityDays) || definition.validityDays <= 0))) {
    return yield* new CollectionError({ message: "Invalid collection identity, fields, evidence attribute, or validity duration" });
  }
  return definition;
});

/** Compile existing MetaCRDT form semantics into a typed Triplex config node. */
export const collectionNode = (input: CollectionDefinition): Effect.Effect<
  ConfigNode.ConfigNode,
  CollectionError | ConfigNode.DuplicateChildKeyError | CanonicalJson.CanonicalEncodingError | Schema.SchemaError
> => Effect.gen(function* () {
  const definition = yield* decodeDefinition(input);
  return yield* ConfigNode.makeTyped({
    kind: "metacrdt.collection", key: definition.form, type: CollectionType, attrs: definition,
    refs: [{ rel: "writes", kind: "attribute", key: definition.evidenceAttribute }],
  });
});

export interface CollectionSubmission {
  /** A host command's stable submission identity. */
  readonly id: string;
  readonly subject: string;
  readonly scope: string;
  readonly validAt: number;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface SubmissionPlan {
  readonly configSnapshot: ContentId.ContentId;
  readonly assertions: readonly TripleInput[];
  readonly operations: readonly TransactOp[];
}

/**
 * Build facts from the exact published release, for both read-only overlay preview
 * and a real authorized command. The caller supplies actor/commandId when committing.
 */
export const prepareSubmission = (
  snapshot: ConfigStore.ConfigSnapshot,
  form: string,
  submission: CollectionSubmission,
): Effect.Effect<SubmissionPlan, CollectionError | Schema.SchemaError> => Effect.gen(function* () {
  const nodes: ConfigNode.ConfigNode[] = [];
  const visit = (node: ConfigNode.ConfigNode) => {
    if (node.kind === "metacrdt.collection" && node.key === form) nodes.push(node);
    for (const child of node.children) visit(child.node);
  };
  visit(snapshot.root);
  if (nodes.length !== 1) {
    return yield* new CollectionError({ message: `Collection ${form} is not uniquely defined in release ${snapshot.id}` });
  }
  const definition = yield* decodeDefinition(nodes[0]!.attrs);
  if (definition.form !== form || !submission.id || !submission.subject || !submission.scope ||
      !Number.isFinite(submission.validAt) || submission.validAt < 0) {
    return yield* new CollectionError({ message: "Invalid submission identity or business time" });
  }
  const validation = validateSubmission(definition, { ...submission.values });
  if (!validation.ok) {
    return yield* new CollectionError({ message: "Submission does not satisfy the published form", fields: validation.errors });
  }
  const validTo = definition.validityDays === undefined ? undefined :
    submission.validAt + definition.validityDays * DAY_MS;
  if (validTo !== undefined && (!Number.isFinite(validTo) || validTo <= submission.validAt)) {
    return yield* new CollectionError({ message: "Invalid evidence expiry" });
  }
  const id = EntityId.make(`metacrdt:submission:${ContentId.hash("metacrdt/submission/v1", submission.id)}`);
  const assertions = [
    {
      entityId: id, entityType: "metacrdt.submission", attribute: ":metacrdt/submission",
      value: { type: "json" as const, value: {
        form, configSnapshot: snapshot.id, subject: submission.subject, scope: submission.scope,
        validAt: submission.validAt, validTo: validTo ?? null, values: validation.values,
      } }, validFrom: 0,
    },
    {
      entityId: EntityId.make(submission.subject), attribute: definition.evidenceAttribute,
      value: { type: "ref" as const, value: EntityId.make(submission.scope) },
      validFrom: submission.validAt, ...(validTo === undefined ? {} : { validTo }),
    },
  ];
  return {
    configSnapshot: snapshot.id, assertions,
    operations: assertions.map((assertion): TransactOp => ({ op: "assert", ...assertion })),
  };
});

/** Triplex overlays accept only attributes observed by the selected derivation. */
export const previewSubmission = (
  triples: TriplesService,
  definition: Derivation.Definition,
  snapshot: ConfigStore.ConfigSnapshot,
  form: string,
  submission: CollectionSubmission,
): Effect.Effect<Derivation.Evaluation, CollectionError | Derivation.Overlay.OverlayError> => Effect.gen(function* () {
  if (definition.configSnapshot !== snapshot.id) {
    return yield* new CollectionError({ message: "Preview and collection must use the same configuration release" });
  }
  const prepared = yield* prepareSubmission(snapshot, form, submission);
  return yield* Derivation.Overlay.evaluateOverlay(triples, definition, {
    basis: { validAt: submission.validAt },
    overlay: { assertions: prepared.assertions.filter((assertion) =>
      definition.dependencies.attributes.includes(assertion.attribute)) },
  });
});
