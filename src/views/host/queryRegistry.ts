import type { FunctionReference } from "convex/server";
import { isRecord } from "@metacrdt/views/runtime";
import { api } from "../../../convex/_generated/api";
import { flattenEntityRows, type RawEntityRow } from "../entityRows";

type QueryArgs = Record<string, unknown>;
type QueryFn = FunctionReference<"query">;

export type QueryRegistryEntry = {
  fn: QueryFn;
  args: (params: QueryArgs) => QueryArgs;
  select?: (result: unknown) => unknown;
};

export type QueryRegistryKey = keyof typeof queryRegistry;

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
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
      ...(isRecord(params["sort"]) ? { sort: params["sort"] } : {}),
      ...(typeof params["cursor"] === "string" ? { cursor: params["cursor"] } : {}),
    }),
    select: (result) =>
      flattenEntityRows(
        Array.isArray(asRecord(result)["page"])
          ? (asRecord(result)["page"] as RawEntityRow[])
          : [],
      ),
  },
  "overview.summary": {
    fn: api.overview.summary,
    args: () => ({}),
    select: (result) => {
      const summary = asRecord(result);
      const required =
        typeof summary["required"] === "number" ? summary["required"] : 0;
      const open = typeof summary["open"] === "number" ? summary["open"] : 0;
      const satisfied =
        typeof summary["satisfied"] === "number"
          ? summary["satisfied"]
          : Math.max(required - open, 0);
      const totalRequired =
        typeof summary["totalRequired"] === "number"
          ? summary["totalRequired"]
          : Math.max(required, satisfied + open);
      return [
        {
          ...summary,
          satisfiedRatio:
            totalRequired === 0 ? 1 : satisfied / totalRequired,
        },
      ];
    },
  },
  "compliance.workerCompliance": {
    fn: api.compliance.workerCompliance,
    args: (params) => ({ worker: stringParam(params, "worker") }),
    select: (result) => {
      const open = asRecord(result)["open"];
      const rows = Array.isArray(open) ? open : [];
      return rows.map((row: unknown) => {
        const item = asRecord(row);
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
