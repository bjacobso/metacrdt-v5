import type { Value } from "@metacrdt/core";
import type { EmitSpec } from "@metacrdt/query";

export const COLLECT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type FieldType = "string" | "number" | "boolean" | "date" | "select";

export type FieldDef = {
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly pii?: boolean;
  readonly sensitive?: boolean;
};

export type FormDef = {
  readonly form: string;
  readonly title: string;
  readonly fields: readonly FieldDef[];
  readonly validityDays?: number;
};

export type CollectionFact = {
  readonly e: string;
  readonly a: string;
  readonly value: Value;
  readonly validTo?: number;
};

export type ValidationError = {
  readonly field: string;
  readonly reason:
    | "required"
    | "unknown field"
    | "expected string"
    | "expected number"
    | "expected boolean"
    | "expected date"
    | "invalid option";
};

export type ValidationResult =
  | { readonly ok: true; readonly values: Record<string, Value> }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export type RequirementSpec = {
  readonly form: string;
  readonly scopeAttr: string;
  readonly guard?: readonly [string, unknown];
  readonly validityDays?: number;
};

export type RequirementRuleClauses = {
  readonly requirement: {
    readonly name: string;
    readonly where: readonly unknown[];
    readonly emit: EmitSpec;
    readonly dependsOnAttributes: readonly string[];
  };
  readonly task: {
    readonly name: string;
    readonly where: readonly unknown[];
    readonly emit: EmitSpec;
    readonly dependsOnAttributes: readonly string[];
  };
};

export type CollectRunTokenState = {
  readonly status: string;
  readonly token?: string;
  readonly tokenConsumedAt?: number;
  readonly tokenExpiresAt?: number;
  readonly collectionTarget?: "host" | "component";
};

function fieldValue(field: FieldDef): Value {
  const out: Record<string, Value> = {
    name: field.name,
    label: field.label,
    type: field.type,
  };
  if (field.required !== undefined) out.required = field.required;
  if (field.options !== undefined) out.options = [...field.options];
  if (field.pii !== undefined) out.pii = field.pii;
  if (field.sensitive !== undefined) out.sensitive = field.sensitive;
  return out;
}

export function formEntity(form: string): string {
  return `form:${form}`;
}

export function formDefinitionFacts(def: FormDef): readonly CollectionFact[] {
  return [
    { e: formEntity(def.form), a: "type", value: "Form" },
    {
      e: formEntity(def.form),
      a: "formDef",
      value: {
        title: def.title,
        fields: def.fields.map(fieldValue),
      },
    },
  ];
}

export function validateSubmission(
  formDef: FormDef,
  rawValues: Record<string, unknown>,
): ValidationResult {
  const fieldsByName = new Map(formDef.fields.map((field) => [field.name, field]));
  const errors: ValidationError[] = [];
  const values: Record<string, Value> = {};

  for (const fieldName of Object.keys(rawValues)) {
    if (!fieldsByName.has(fieldName)) {
      errors.push({ field: fieldName, reason: "unknown field" });
    }
  }

  for (const field of formDef.fields) {
    const value = rawValues[field.name];
    if (value === undefined || value === null || value === "") {
      if (field.required) errors.push({ field: field.name, reason: "required" });
      continue;
    }

    if (field.type === "string") {
      if (typeof value !== "string") {
        errors.push({ field: field.name, reason: "expected string" });
        continue;
      }
      values[field.name] = value;
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({ field: field.name, reason: "expected number" });
        continue;
      }
      values[field.name] = value;
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") {
        errors.push({ field: field.name, reason: "expected boolean" });
        continue;
      }
      values[field.name] = value;
    } else if (field.type === "date") {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        errors.push({ field: field.name, reason: "expected date" });
        continue;
      }
      values[field.name] = value;
    } else if (field.type === "select") {
      if (typeof value !== "string") {
        errors.push({ field: field.name, reason: "expected string" });
        continue;
      }
      if (field.options !== undefined && !field.options.includes(value)) {
        errors.push({ field: field.name, reason: "invalid option" });
        continue;
      }
      values[field.name] = value;
    }
  }

  return errors.length === 0 ? { ok: true, values } : { ok: false, errors };
}

export function submissionFacts(
  subject: string,
  formDef: FormDef,
  rawValues: Record<string, unknown>,
  scope: string,
  now = Date.now(),
): readonly CollectionFact[] {
  const validation = validateSubmission(formDef, rawValues);
  if (!validation.ok) {
    const message = validation.errors
      .map((error) => `${error.field}: ${error.reason}`)
      .join(", ");
    throw new Error(`invalid submission for ${formDef.form}: ${message}`);
  }
  const validTo =
    formDef.validityDays === undefined ? undefined : now + formDef.validityDays * DAY_MS;
  return [
    ...Object.entries(validation.values).map(([field, value]) => ({
      e: subject,
      a: `${formDef.form}/${field}`,
      value,
    })),
    {
      e: subject,
      a: `submitted.${formDef.form}`,
      value: scope,
      ...(validTo === undefined ? {} : { validTo }),
    },
  ];
}

export function scopeEntity(
  spec: Pick<RequirementSpec, "scopeAttr" | "guard">,
  placement: Record<string, unknown>,
  scopeFacts: Record<string, unknown> = {},
): string | null {
  const scope = placement[spec.scopeAttr];
  if (typeof scope !== "string" || scope.length === 0) return null;
  if (spec.guard !== undefined) {
    const [attr, expected] = spec.guard;
    if (scopeFacts[attr] !== expected) return null;
  }
  return scope;
}

export function requirementWhere(spec: RequirementSpec): readonly unknown[] {
  const where: unknown[] = [
    ["?p", "type", "Placement"],
    ["?p", "worker", "?w"],
    ["?p", spec.scopeAttr, "?s"],
  ];
  if (spec.guard) where.push(["?s", spec.guard[0], spec.guard[1]]);
  return where;
}

export function requirementDeps(spec: RequirementSpec): readonly string[] {
  const deps = ["type", "worker", spec.scopeAttr];
  if (spec.guard) deps.push(spec.guard[0]);
  return [...new Set(deps)];
}

export function requirementClauses(spec: RequirementSpec): RequirementRuleClauses {
  const where = requirementWhere(spec);
  const dependsOnAttributes = requirementDeps(spec);
  return {
    requirement: {
      name: `require.${spec.form}`,
      where,
      emit: { e: "?w", a: `requires.${spec.form}`, v: "?s" },
      dependsOnAttributes,
    },
    task: {
      name: `task.${spec.form}`,
      where: [...where, { not: ["?w", `submitted.${spec.form}`, "?s"] }],
      emit: { e: "?w", a: `task.${spec.form}`, v: "?s" },
      dependsOnAttributes: [...dependsOnAttributes, `submitted.${spec.form}`],
    },
  };
}

export function tokenExpiresAt(now: number, expireSeconds?: number): number {
  return now + (expireSeconds === undefined ? COLLECT_TOKEN_TTL_MS : expireSeconds * 1000);
}

export function tokenInvalidReason(
  run: Pick<CollectRunTokenState, "status" | "tokenConsumedAt" | "tokenExpiresAt">,
  now: number,
): "used" | "expired" | "not waiting" | null {
  if (run.tokenConsumedAt !== undefined) return "used";
  if (run.tokenExpiresAt !== undefined && run.tokenExpiresAt <= now) return "expired";
  if (run.status !== "waiting") return "not waiting";
  return null;
}

export function isLiveToken(
  run: CollectRunTokenState,
  now: number,
  collectionTarget?: "host" | "component",
): boolean {
  return (
    tokenInvalidReason(run, now) === null &&
    run.token !== undefined &&
    (collectionTarget === undefined ||
      (run.collectionTarget ?? "host") === collectionTarget)
  );
}

export function hasLiveToken(
  runs: readonly CollectRunTokenState[],
  now: number,
  collectionTarget?: "host" | "component",
): boolean {
  return runs.some((run) => isLiveToken(run, now, collectionTarget));
}
