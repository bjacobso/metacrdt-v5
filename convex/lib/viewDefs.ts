import type { MutationCtx, QueryCtx } from "../_generated/server";
import { project, runWhere } from "./engine";
import { eventLogTripleSource } from "./eventLogTripleSource";

export type ViewDef = {
  name: string;
  label?: string;
  description?: string;
  spec: unknown;
};

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

async function currentRows(ctx: Ctx, where: unknown[], select: string[]) {
  const coord = { txTime: Date.now(), validTime: Date.now() };
  return project(
    await runWhere(ctx, where, coord, {}, { source: eventLogTripleSource }),
    select,
  );
}

export async function loadViewDef(
  ctx: Ctx,
  name: string,
): Promise<ViewDef | null> {
  const rows = await currentRows(ctx, [[viewId(name), "?a", "?v"]], [
    "?a",
    "?v",
  ]);
  if (rows.length === 0) return null;
  const m: Record<string, unknown[]> = {};
  for (const r of rows) (m[String(r.a)] ??= []).push(r.v);
  return {
    name,
    label: m["label"]?.[0] ? String(m["label"][0]) : undefined,
    description: m["description"]?.[0]
      ? String(m["description"][0])
      : undefined,
    spec: parseSpec(m["specJson"]?.[0] ?? m["spec"]?.[0] ?? null),
  };
}

export async function listViewDefs(ctx: Ctx): Promise<ViewDef[]> {
  const rows = await currentRows(ctx, [["?e", "type", "View"]], ["?e"]);
  const seen = new Set<string>();
  const out: ViewDef[] = [];
  for (const row of rows) {
    const e = String(row.e);
    if (seen.has(e) || !e.startsWith("view:")) continue;
    seen.add(e);
    const def = await loadViewDef(ctx, e.slice("view:".length));
    if (def) out.push(def);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
