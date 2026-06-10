import type { FunctionReference } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { shortId } from "../../ui";
import type { ViewRow } from "../ViewRenderer";

type QueryArgs = Record<string, unknown>;
type QueryFn = FunctionReference<"query">;

export type QueryRegistryEntry = {
  fn: QueryFn;
  args: (params: QueryArgs) => QueryArgs;
  select?: (result: unknown) => unknown;
};

export type QueryRegistryKey = keyof typeof queryRegistry;

export interface RawEntityRow {
  readonly id: string;
  readonly attributes: Record<string, readonly unknown[]>;
  readonly denied?: readonly { readonly a: string }[];
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function flattenEntityRows(rows: readonly RawEntityRow[]): ViewRow[] {
  const attrNames = [
    ...new Set(
      rows.flatMap((row) =>
        Object.keys(row.attributes).filter((name) => name !== "name" && name !== "type"),
      ),
    ),
  ].sort();

  return rows.map((row) => {
    const deniedKeys = new Set((row.denied ?? []).map((d) => d.a));
    const out: ViewRow = {
      id: row.id,
      name: valueText(row.attributes["name"]?.[0] ?? shortId(row.id)),
    };
    for (const name of attrNames) {
      out[name] = deniedKeys.has(name)
        ? "Denied"
        : (row.attributes[name] ?? []).map(valueText).join(", ");
    }
    return out;
  });
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringParam(params: QueryArgs, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function numberParam(
  params: QueryArgs,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export const queryRegistry = {
  "entities.queryEntities": {
    fn: api.entities.queryEntities,
    args: (params) => ({
      type: stringParam(params, "type"),
      pageSize: numberParam(params, "pageSize", 50),
      ...(Array.isArray(params["filters"]) ? { filters: params["filters"] } : {}),
      ...(record(params["sort"]) ? { sort: params["sort"] } : {}),
      ...(typeof params["cursor"] === "string" ? { cursor: params["cursor"] } : {}),
    }),
    select: (result) =>
      flattenEntityRows(
        Array.isArray(record(result)["page"])
          ? (record(result)["page"] as RawEntityRow[])
          : [],
      ),
  },
  "overview.summary": {
    fn: api.overview.summary,
    args: () => ({}),
    select: (result) => {
      const summary = record(result);
      const required =
        typeof summary["required"] === "number" ? summary["required"] : 0;
      const open = typeof summary["open"] === "number" ? summary["open"] : 0;
      return [
        {
          ...summary,
          satisfiedRatio: required === 0 ? 1 : (required - open) / required,
        },
      ];
    },
  },
  "compliance.workerCompliance": {
    fn: api.compliance.workerCompliance,
    args: (params) => ({ worker: stringParam(params, "worker") }),
    select: (result) => {
      const open = record(result)["open"];
      const rows = Array.isArray(open) ? open : [];
      return rows.map((row: unknown) => {
        const item = record(row);
        const because = item["because"];
        return {
          form: item["form"],
          scope: item["scope"],
          because: Array.isArray(because) ? `${because.length}` : "0",
        };
      });
    },
  },
  "flows.listFlowDefs": {
    fn: api.flows.listFlowDefs,
    args: () => ({}),
  },
  "actions.actionsForType": {
    fn: api.actions.actionsForType,
    args: (params) => ({ type: stringParam(params, "type") }),
  },
} satisfies Record<string, QueryRegistryEntry>;

export function lookupQuery(ref: string): QueryRegistryEntry | undefined {
  return queryRegistry[ref as QueryRegistryKey];
}
