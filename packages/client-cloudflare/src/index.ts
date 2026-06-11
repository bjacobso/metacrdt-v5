import {
  createDurableObjectSqliteLiveQuerySession,
  type DurableObjectSqliteLiveQuerySession,
} from "@metacrdt/cloudflare";
import type { MetacrdtClient, ClientQueryArgs } from "@metacrdt/client";
import type {
  DatalogQueryArgsType,
  DatalogQueryResult,
} from "@metacrdt/runtime";
import { useEffect, useMemo, useState } from "react";

type FactRow = {
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
};

export type CloudflareMetacrdtClientOptions = {
  readonly url?: string;
  readonly protocol?: string;
  readonly connectionId?: string;
  readonly connectionIdParam?: string;
  readonly reconnect?: { readonly retries?: number; readonly delayMs?: number } | false;
};

type LiveStore = {
  readonly configured: boolean;
  subscribe(
    id: string,
    query: DatalogQueryArgsType,
    listener: () => void,
  ): () => void;
  snapshot(id: string): DatalogQueryResult | undefined;
};

const nowCoord = () => {
  const now = Date.now();
  return { txTime: now, validTime: now };
};

const currentFactsQuery = (): DatalogQueryArgsType => ({
  where: [["?e", "?a", "?v"]],
  select: ["?e", "?a", "?v"],
  coord: nowCoord(),
});

function createLiveStore(options: CloudflareMetacrdtClientOptions): LiveStore {
  if (!options.url) {
    return {
      configured: false,
      subscribe: () => () => {},
      snapshot: () => undefined,
    };
  }

  const listeners = new Map<string, Set<() => void>>();
  let session: DurableObjectSqliteLiveQuerySession | undefined;

  const ensureSession = () => {
    if (session !== undefined) return session;
    session = createDurableObjectSqliteLiveQuerySession({
      url: options.url!,
      protocol: options.protocol,
      connectionId: options.connectionId ?? "dashboard",
      connectionIdParam: options.connectionIdParam,
      reconnect: options.reconnect ?? { retries: 5, delayMs: 1_000 },
      onSnapshot: (snapshot) => {
        for (const listener of listeners.get(snapshot.id) ?? []) listener();
      },
    });
    session.connect();
    return session;
  };

  return {
    configured: true,
    subscribe(id, query, listener) {
      const current = ensureSession();
      let set = listeners.get(id);
      if (set === undefined) {
        set = new Set();
        listeners.set(id, set);
        current.subscribe({ id, query });
      }
      set.add(listener);
      return () => {
        const active = listeners.get(id);
        if (active === undefined) return;
        active.delete(listener);
        if (active.size === 0) {
          listeners.delete(id);
          current.unsubscribe(id);
        }
      };
    },
    snapshot(id) {
      return session?.snapshot(id)?.result;
    },
  };
}

function queryFor(name: string, args: ClientQueryArgs): {
  readonly id: string;
  readonly query: DatalogQueryArgsType;
} {
  if (name === "datalog.datalog" && args !== "skip") {
    const datalog = args as Partial<DatalogQueryArgsType>;
    return {
      id: `dashboard:${name}:${JSON.stringify(datalog)}`,
      query: {
        where: datalog.where ?? [],
        select: datalog.select ?? [],
        coord: datalog.coord ?? nowCoord(),
      },
    };
  }
  return { id: "dashboard:currentFacts", query: currentFactsQuery() };
}

function factRows(result: DatalogQueryResult | undefined): FactRow[] {
  return (result?.rows ?? [])
    .map((row) => ({
      e: String(row.e ?? ""),
      a: String(row.a ?? ""),
      v: row.v,
    }))
    .filter((row) => row.e !== "" && row.a !== "");
}

function typeOf(facts: readonly FactRow[], e: string): string | undefined {
  return facts.find((fact) => fact.e === e && fact.a === "type")?.v as
    | string
    | undefined;
}

function factsByEntity(facts: readonly FactRow[]) {
  const out = new Map<string, FactRow[]>();
  for (const fact of facts) {
    const list = out.get(fact.e);
    if (list === undefined) out.set(fact.e, [fact]);
    else list.push(fact);
  }
  return out;
}

function entityAttrs(facts: readonly FactRow[]) {
  const attrs: Record<string, unknown[]> = {};
  for (const fact of facts) (attrs[fact.a] ??= []).push(fact.v);
  return attrs;
}

function entityOrigin(id: string, type?: string) {
  return id.includes(":") &&
    (id.startsWith("type:") ||
      id.startsWith("attr:") ||
      id.startsWith("form:") ||
      id.startsWith("flow:") ||
      id.startsWith("action:") ||
      type === "SystemProcess")
    ? "system"
    : "data";
}

function listTypes(facts: readonly FactRow[]) {
  const counts = new Map<string, Set<string>>();
  for (const fact of facts) {
    if (fact.a !== "type" || typeof fact.v !== "string") continue;
    const set = counts.get(fact.v) ?? new Set<string>();
    set.add(fact.e);
    counts.set(fact.v, set);
  }
  return [...counts.entries()]
    .map(([type, entities]) => ({
      type,
      count: entities.size,
      origin: type.startsWith("System") || type.startsWith("Meta") ? "system" : "data",
    }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function listEntities(facts: readonly FactRow[], args: ClientQueryArgs) {
  const input = args === "skip" ? {} : args;
  const wantType = typeof input.type === "string" ? input.type : undefined;
  const origin = input.origin === "system" || input.origin === "data" ? input.origin : "all";
  const limit = typeof input.limit === "number" ? input.limit : 500;
  const byEntity = factsByEntity(facts);
  const out: Array<{ id: string; name?: string; type: string; origin: string }> = [];
  for (const [id, entityFacts] of byEntity) {
    const type = typeOf(entityFacts, id) ?? "";
    if (wantType !== undefined && type !== wantType) continue;
    const rowOrigin = entityOrigin(id, type);
    if (origin !== "all" && origin !== rowOrigin) continue;
    const name = entityFacts.find((fact) => fact.a === "name")?.v;
    out.push({
      id,
      name: name === undefined ? undefined : String(name),
      type,
      origin: rowOrigin,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
}

function queryEntities(facts: readonly FactRow[], args: ClientQueryArgs) {
  const input = args === "skip" ? {} : args;
  const type = typeof input.type === "string" ? input.type : undefined;
  const pageSize = typeof input.pageSize === "number" ? input.pageSize : 50;
  const entities = listEntities(facts, { type, limit: pageSize, origin: "all" });
  const byEntity = factsByEntity(facts);
  const page = entities.map((entity) => ({
    id: entity.id,
    attributes: entityAttrs(byEntity.get(entity.id) ?? []),
  }));
  return { total: entities.length, page };
}

function typeSchema(facts: readonly FactRow[], args: ClientQueryArgs) {
  const input = args === "skip" ? {} : args;
  const type = typeof input.type === "string" ? input.type : undefined;
  const rows = type === undefined ? [] : queryEntities(facts, { type, pageSize: 100 }).page;
  const names = new Set<string>();
  for (const row of rows) {
    for (const name of Object.keys(row.attributes)) {
      if (name !== "type") names.add(name);
    }
  }
  const attributes = [...names].sort();
  return { attributes, columns: attributes.map((name) => ({ name })) };
}

function emptyResult(name: string, args: ClientQueryArgs) {
  return deriveDashboardResult(name, args, [], {
    states: [],
    rows: [],
    eventSourceIds: [],
  });
}

function deriveDashboardResult(
  name: string,
  args: ClientQueryArgs,
  facts: readonly FactRow[],
  raw: DatalogQueryResult,
) {
  if (args === "skip") return undefined;
  switch (name) {
    case "datalog.datalog":
      return raw;
    case "overview.summary": {
      const types = listTypes(facts);
      return {
        configuredTypes: types.length,
        placements: types.find((type) => type.type === "Placement")?.count ?? 0,
        reusedScopes: 0,
        satisfiedPct: 100,
        required: 0,
        open: 0,
      };
    }
    case "overview.recentActivity":
    case "facts.entityTimeline": {
      const limit = typeof args.limit === "number" ? args.limit : 12;
      const entity = typeof args.e === "string" ? args.e : undefined;
      return facts
        .filter((fact) => entity === undefined || fact.e === entity)
        .slice(0, limit)
        .map((fact, i) => ({
          txId: raw.eventSourceIds[i] ?? `${fact.e}:${fact.a}:${i}`,
          txTime: Date.now(),
          kind: "assert",
          e: fact.e,
          a: fact.a,
          v: fact.v,
          actorId: "cloudflare-live-query",
          actor: "cloudflare-live-query",
          validFrom: undefined,
          validTo: null,
        }));
    }
    case "compliance.workerCompliance":
      return { required: [], open: [] };
    case "entities.listEntityTypes":
      return listTypes(facts);
    case "entities.listEntities":
      return listEntities(facts, args);
    case "entities.queryEntities":
      return queryEntities(facts, args);
    case "attributes.typeSchemaAsOf":
      return typeSchema(facts, args);
    case "entities.entityDetail": {
      const e = typeof args.e === "string" ? args.e : "";
      const scoped = facts.filter((fact) => fact.e === e);
      const types = scoped
        .filter((fact) => fact.a === "type" && typeof fact.v === "string")
        .map((fact) => String(fact.v));
      const attributes = entityAttrs(scoped);
      return {
        id: e,
        e,
        name: scoped.find((fact) => fact.a === "name")?.v,
        types,
        origin: entityOrigin(e, types[0]),
        attributes,
        denied: [],
        obligations: [],
        actions: [],
        flows: [],
      };
    }
    case "facts.entityFactsAsOf": {
      const e = typeof args.e === "string" ? args.e : "";
      return {
        coord: { txTime: Date.now(), validTime: Date.now() },
        facts: facts
          .filter((fact) => fact.e === e)
          .map((fact) => ({
            e: fact.e,
            a: fact.a,
            v: fact.v,
            actor: "cloudflare-live-query",
            txTime: Date.now(),
            validFrom: undefined,
            validTo: null,
          })),
        denied: [],
      };
    }
    case "metacrdtComponent.listOwnedCurrentEntities":
    case "system.listSystemProcesses":
    case "actions.listActions":
    case "flows.listFlows":
    case "flows.listFlowDefs":
    case "configHistory.history":
      return [];
    case "configHistory.currentManifest":
      return {};
    default:
      return undefined;
  }
}

function useCloudflareQuery<T>(
  store: LiveStore,
  name: string,
  args: ClientQueryArgs,
): T | undefined {
  const argsKey = args === "skip" ? "skip" : JSON.stringify(args);
  const subscription = useMemo(
    () => (args === "skip" ? undefined : queryFor(name, args)),
    // Dashboard callers often pass object literals; keying by serialized args
    // keeps the live-query subscription stable across equivalent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, argsKey],
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (subscription === undefined) return;
    return store.subscribe(subscription.id, subscription.query, () =>
      setTick((value) => value + 1),
    );
  }, [store, subscription]);

  if (args === "skip" || subscription === undefined) return undefined;
  if (!store.configured) return emptyResult(name, args) as T | undefined;
  const raw = store.snapshot(subscription.id);
  if (raw === undefined) return undefined;
  void tick;
  return deriveDashboardResult(name, args, factRows(raw), raw) as T | undefined;
}

export function createCloudflareMetacrdtClient(
  options: CloudflareMetacrdtClientOptions,
): MetacrdtClient {
  const store = createLiveStore(options);
  return {
    useQuery<T>(name: string, args: ClientQueryArgs = {}): T | undefined {
      return useCloudflareQuery<T>(store, name, args);
    },
    useMutation(name: string) {
      return async () => {
        throw new Error(`${name} is not available through the Cloudflare live-query client`);
      };
    },
  };
}
