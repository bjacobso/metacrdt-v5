import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";

export type ActionField = {
  name: string;
  label?: string;
  type: "string" | "number" | "boolean" | "select";
  required?: boolean;
  options?: string[];
  defaultValue?: unknown;
};

export type ActionDef = {
  name: string;
  label?: string;
  appliesTo?: string;
  asserts: Record<string, unknown>;
  fields: ActionField[];
  opensForm?: {
    form: unknown;
    scope: unknown;
  };
};

export const actionFieldValidator = v.object({
  name: v.string(),
  label: v.optional(v.string()),
  type: v.union(
    v.literal("string"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("select"),
  ),
  required: v.optional(v.boolean()),
  options: v.optional(v.array(v.string())),
  defaultValue: v.optional(v.any()),
});

export const opensFormValidator = v.object({
  form: v.any(),
  scope: v.any(),
});

export function actionId(name: string): string {
  return `action:${name}`;
}

export async function loadActionDef(
  ctx: QueryCtx,
  name: string,
): Promise<ActionDef | null> {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_e", (q) => q.eq("e", actionId(name)))
    .collect();
  if (rows.length === 0) return null;
  const m: Record<string, unknown[]> = {};
  for (const r of rows) (m[r.a] ??= []).push(r.v);
  return {
    name,
    label: m["label"]?.[0] ? String(m["label"][0]) : undefined,
    appliesTo: m["appliesTo"]?.[0] ? String(m["appliesTo"][0]) : undefined,
    asserts: (m["asserts"]?.[0] ?? {}) as Record<string, unknown>,
    fields: Array.isArray(m["fields"]?.[0])
      ? (m["fields"]![0] as ActionField[])
      : [],
    opensForm:
      m["opensForm"]?.[0] && typeof m["opensForm"][0] === "object"
        ? (m["opensForm"][0] as { form: unknown; scope: unknown })
        : undefined,
  };
}

export function resolveActionValue(
  raw: unknown,
  entity: string,
  fields: ActionField[],
  args: Record<string, unknown>,
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "$entity") return entity;
  if (!raw.startsWith("$arg.")) return raw;
  const name = raw.slice("$arg.".length);
  const field = fields.find((f) => f.name === name);
  if (!field) throw new Error(`unknown action arg placeholder: ${name}`);
  const value = args[name] ?? field.defaultValue;
  if (value === undefined && field.required !== false) {
    throw new Error(`missing action arg: ${name}`);
  }
  if (value === undefined) return null;
  if (field.type === "select" && value !== undefined) {
    const allowed = field.options ?? [];
    if (!allowed.includes(String(value))) {
      throw new Error(`invalid action arg ${name}: ${String(value)}`);
    }
  }
  return value;
}

export function resolveActionString(
  label: string,
  raw: unknown,
  entity: string,
  fields: ActionField[],
  args: Record<string, unknown>,
): string {
  const value = resolveActionValue(raw, entity, fields, args);
  if (value === null || value === "") {
    throw new Error(`missing action ${label}`);
  }
  return String(value);
}
