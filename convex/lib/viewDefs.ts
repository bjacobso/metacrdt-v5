import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ViewDef = {
  name: string;
  label?: string;
  description?: string;
  spec: unknown;
};

export type ViewSummary = Omit<ViewDef, "spec">;

export function viewId(name: string): string {
  return `view:${name}`;
}

type Ctx = QueryCtx | MutationCtx;

function parseSpec(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function currentRows(ctx: Ctx, e: string) {
  return await ctx.db
    .query("currentFacts")
    .withIndex("by_e", (q) => q.eq("e", e))
    .take(1000);
}

async function currentValues(ctx: Ctx, e: string, a: string) {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", a))
    .take(10);
  return rows.map((row) => row.v);
}

async function loadViewSummary(
  ctx: Ctx,
  name: string,
): Promise<ViewSummary | null> {
  const e = viewId(name);
  const typeValues = await currentValues(ctx, e, "type");
  if (!typeValues.includes("View")) return null;
  const labels = await currentValues(ctx, e, "label");
  const descriptions = await currentValues(ctx, e, "description");
  return {
    name,
    label: labels[0] ? String(labels[0]) : undefined,
    description: descriptions[0] ? String(descriptions[0]) : undefined,
  };
}

export async function loadViewDef(
  ctx: Ctx,
  name: string,
): Promise<ViewDef | null> {
  const rows = await currentRows(ctx, viewId(name));
  if (rows.length === 0) return null;
  const m: Record<string, unknown[]> = {};
  for (const row of rows) (m[row.a] ??= []).push(row.v);
  if (!m["type"]?.includes("View")) return null;
  return {
    name,
    label: m["label"]?.[0] ? String(m["label"][0]) : undefined,
    description: m["description"]?.[0]
      ? String(m["description"][0])
      : undefined,
    spec: parseSpec(m["specJson"]?.[0] ?? m["spec"]?.[0] ?? null),
  };
}

export async function listViewDefs(ctx: Ctx): Promise<ViewSummary[]> {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_a_v", (q) => q.eq("a", "type").eq("v", "View"))
    .take(1000);
  const seen = new Set<string>();
  const out: ViewSummary[] = [];
  for (const row of rows) {
    const e = row.e;
    if (seen.has(e) || !e.startsWith("view:")) continue;
    seen.add(e);
    const def = await loadViewSummary(ctx, e.slice("view:".length));
    if (def) out.push(def);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
