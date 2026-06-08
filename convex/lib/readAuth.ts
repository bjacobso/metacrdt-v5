import { Doc } from "../_generated/dataModel";
import { QueryCtx } from "../_generated/server";
import { currentEventLogAsserts } from "./eventLogCurrent";

export const READ_GRANT_ATTR = "grants.read";
export const ANONYMOUS_PRINCIPAL = "anonymous";

export type DeniedAttribute = {
  a: string;
  reason: "pii";
};

type FormField = {
  name?: unknown;
  pii?: unknown;
  sensitive?: unknown;
};

type FormDef = {
  fields?: unknown;
};

type ReadGrant =
  | string
  | {
      e?: unknown;
      entity?: unknown;
      a?: unknown;
      attr?: unknown;
      attribute?: unknown;
    };

function formEntity(form: string): string {
  return `form:${form}`;
}

/** Server-derived principal for read authorization. Never accept this from args. */
export async function readPrincipal(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? ANONYMOUS_PRINCIPAL;
}

async function formFieldPolicy(
  ctx: QueryCtx,
  form: string,
  field: string,
): Promise<FormField | null> {
  const [row] = await currentEventLogAsserts(ctx, {
    e: formEntity(form),
    a: "formDef",
    limit: 200,
  });
  if (!row) return null;
  const def = row.v as FormDef;
  const fields = Array.isArray(def.fields) ? def.fields : [];
  return (
    (fields as FormField[]).find((f) => f && f.name === field) ?? null
  );
}

/**
 * Whether an attribute carries PII/sensitive values. Today this is form-schema
 * driven (`i9/ssn` comes from form `i9`, field `ssn`, marked `pii: true`), with a
 * schema-as-facts escape hatch for future non-form attributes.
 */
export async function isSensitiveAttribute(
  ctx: QueryCtx,
  a: string,
): Promise<boolean> {
  const [form, field, extra] = a.split("/");
  if (form && field && extra === undefined) {
    const policy = await formFieldPolicy(ctx, form, field);
    if (policy?.pii === true || policy?.sensitive === true) return true;
  }

  const rows = await currentEventLogAsserts(ctx, {
    e: `attr:${a}`,
    limit: 200,
  });
  return rows.some(
    (r) =>
      (r.a === "pii" || r.a === "sensitive") &&
      (r.v === true || r.v === "true"),
  );
}

function grantMatches(grant: ReadGrant, e: string, a: string): boolean {
  if (typeof grant === "string") return grant === "*" || grant === a;
  if (!grant || typeof grant !== "object") return false;
  const ge = grant.e ?? grant.entity;
  const ga = grant.a ?? grant.attr ?? grant.attribute;
  const entityOk = ge === undefined || ge === "*" || ge === e;
  const attrOk = ga === undefined || ga === "*" || ga === a;
  return entityOk && attrOk;
}

export async function canReadAttribute(
  ctx: QueryCtx,
  principal: string,
  e: string,
  a: string,
): Promise<boolean> {
  if (!(await isSensitiveAttribute(ctx, a))) return true;

  const grants = await currentEventLogAsserts(ctx, {
    e: principal,
    a: READ_GRANT_ATTR,
    limit: 500,
  });
  return grants.some((g) => grantMatches(g.v as ReadGrant, e, a));
}

export async function redactAttributeMap(
  ctx: QueryCtx,
  e: string,
  attributes: Record<string, unknown[]>,
): Promise<{ attributes: Record<string, unknown[]>; denied: DeniedAttribute[] }> {
  const principal = await readPrincipal(ctx);
  const out: Record<string, unknown[]> = {};
  const denied: DeniedAttribute[] = [];

  for (const [a, values] of Object.entries(attributes)) {
    if (await canReadAttribute(ctx, principal, e, a)) {
      out[a] = values;
    } else {
      denied.push({ a, reason: "pii" });
    }
  }

  return { attributes: out, denied };
}

export async function readableFact(
  ctx: QueryCtx,
  fact: Pick<Doc<"facts">, "e" | "a">,
): Promise<boolean> {
  return await canReadAttribute(ctx, await readPrincipal(ctx), fact.e, fact.a);
}
