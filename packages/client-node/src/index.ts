import type { ClientQueryArgs, MetacrdtClient } from "@metacrdt/client";
import type { Event } from "@metacrdt/core";
import {
  createNodeSyncClient,
  type NodeSyncClient,
  type NodeSyncHealthResponse,
} from "@metacrdt/node";
import { useEffect, useMemo, useState } from "react";

export type NodeMetacrdtClientOptions = {
  readonly baseUrl?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly refreshMs?: number;
};

type NodeSnapshot = {
  readonly loading: boolean;
  readonly health?: NodeSyncHealthResponse;
  readonly events: readonly Event[];
  readonly error?: string;
};

type FactRow = {
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
  readonly event: Event;
};

const emptySnapshot: NodeSnapshot = {
  loading: false,
  events: [],
};

function useNodeSnapshot(options: NodeMetacrdtClientOptions): NodeSnapshot {
  const baseUrl = options.baseUrl;
  const client = useMemo<NodeSyncClient | null>(
    () =>
      baseUrl
        ? createNodeSyncClient({
            baseUrl,
            headers: options.headers,
          })
        : null,
    [baseUrl, options.headers],
  );
  const [snapshot, setSnapshot] = useState<NodeSnapshot>(
    client === null ? emptySnapshot : { loading: true, events: [] },
  );

  useEffect(() => {
    if (client === null) {
      setSnapshot(emptySnapshot);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      setSnapshot((current) => ({ ...current, loading: true }));
      try {
        const [health, delta] = await Promise.all([
          client.health(),
          client.pull(),
        ]);
        if (!cancelled) {
          setSnapshot({
            loading: false,
            health,
            events: delta.events,
          });
        }
      } catch (cause) {
        if (!cancelled) {
          setSnapshot({
            loading: false,
            events: [],
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      if (!cancelled && options.refreshMs !== undefined) {
        timer = setTimeout(load, options.refreshMs);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [client, options.refreshMs]);

  return snapshot;
}

function assertFacts(events: readonly Event[]): FactRow[] {
  return events
    .filter(
      (event): event is Event & { e: string; a: string; v: unknown } =>
        event.kind === "assert" &&
        event.e !== undefined &&
        event.a !== undefined,
    )
    .map((event) => ({
      e: event.e,
      a: event.a,
      v: event.v,
      event,
    }));
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

function eventTime(event: Event): number {
  return event.hlc.pt;
}

function entityOrigin(id: string, type?: string) {
  return id.startsWith("type:") ||
    id.startsWith("attr:") ||
    id.startsWith("form:") ||
    id.startsWith("flow:") ||
    id.startsWith("action:") ||
    type === "SystemProcess"
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

function listEntities(facts: readonly FactRow[], args: Record<string, unknown>) {
  const wantType = typeof args.type === "string" ? args.type : undefined;
  const origin = args.origin === "system" || args.origin === "data" ? args.origin : "all";
  const limit = typeof args.limit === "number" ? args.limit : 500;
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

function queryEntities(facts: readonly FactRow[], args: Record<string, unknown>) {
  const type = typeof args.type === "string" ? args.type : undefined;
  const pageSize = typeof args.pageSize === "number" ? args.pageSize : 50;
  const entities = listEntities(facts, { type, limit: pageSize, origin: "all" });
  const byEntity = factsByEntity(facts);
  const page = entities.map((entity) => ({
    id: entity.id,
    attributes: entityAttrs(byEntity.get(entity.id) ?? []),
  }));
  return { total: entities.length, page };
}

function typeSchema(facts: readonly FactRow[], args: Record<string, unknown>) {
  const type = typeof args.type === "string" ? args.type : undefined;
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

function activity(events: readonly Event[], args: Record<string, unknown>) {
  const limit = typeof args.limit === "number" ? args.limit : 12;
  const e = typeof args.e === "string" ? args.e : undefined;
  return events
    .filter((event) => e === undefined || event.e === e)
    .slice()
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, limit)
    .map((event) => ({
      txId: event.id,
      txTime: eventTime(event),
      kind: event.kind,
      e: event.e ?? "",
      a: event.a ?? "",
      v: event.v,
      actorId: event.actor,
      actor: event.actor,
      validFrom: event.validFrom,
      validTo: event.validTo,
      reason: event.reason,
    }));
}

function deriveResult(
  name: string,
  args: Record<string, unknown>,
  snapshot: NodeSnapshot,
) {
  const facts = assertFacts(snapshot.events);
  switch (name) {
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
    case "facts.entityTimeline":
      return activity(snapshot.events, args);
    case "datalog.datalog":
      return {
        states: [],
        rows: facts.map((fact) => ({ e: fact.e, a: fact.a, v: fact.v })),
        eventSourceIds: facts.map((fact) => fact.event.id),
      };
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
      return {
        id: e,
        e,
        name: scoped.find((fact) => fact.a === "name")?.v,
        types,
        origin: entityOrigin(e, types[0]),
        attributes: entityAttrs(scoped),
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
            actor: fact.event.actor,
            txTime: eventTime(fact.event),
            validFrom: fact.event.validFrom,
            validTo: fact.event.validTo,
            reason: fact.event.reason,
          })),
        denied: [],
      };
    }
    case "system.listSystemProcesses":
      return snapshot.health
        ? [
            {
              id: snapshot.health.profile.replicaId,
              name: snapshot.health.profile.name,
              capabilities: snapshot.health.profile.capabilities,
              vv: snapshot.health.vv,
            },
          ]
        : [];
    case "metacrdtComponent.listOwnedCurrentEntities":
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

function useNodeQuery<T>(
  options: NodeMetacrdtClientOptions,
  name: string,
  args: ClientQueryArgs,
): T | undefined {
  const snapshot = useNodeSnapshot(options);
  if (args === "skip") return undefined;
  if (snapshot.loading && options.baseUrl) return undefined;
  return deriveResult(name, args, snapshot) as T | undefined;
}

export function createNodeMetacrdtClient(
  options: NodeMetacrdtClientOptions,
): MetacrdtClient {
  return {
    useQuery<T>(name: string, args: ClientQueryArgs = {}): T | undefined {
      return useNodeQuery<T>(options, name, args);
    },
    useMutation(name: string) {
      return async () => {
        throw new Error(`${name} is not available through the Node sync client`);
      };
    },
  };
}
