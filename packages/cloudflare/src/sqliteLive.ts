import {
  parseClauses,
  type AnyClause,
  type PatternClause,
} from "@metacrdt/query";
import {
  DatalogQueryArgs,
  type DatalogQueryArgsType,
  type DatalogQueryResult,
} from "@metacrdt/runtime";
import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import type { WebSocketLike } from "./relay.js";
import type {
  DurableObjectSqliteLiveQuerySubscriptionStore,
} from "./durableObjectSqlite.js";
import type { DurableObjectSqliteProjectionChange } from "./sqliteCurrent.js";

const DEFAULT_PROTOCOL = "metacrdt.cloudflare.sqlite.live.v1";
const DEFAULT_QUERY_PROTOCOL = "metacrdt.cloudflare.sqlite.live-query.v1";

type MessageEventLike = { data: unknown };
type CloseEventLike = { code?: number; reason?: string };

export class DurableObjectSqliteLiveError extends Data.TaggedError(
  "DurableObjectSqliteLiveError",
)<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const DurableObjectSqliteLiveSubscriptionFilterSchema = Schema.Struct({
  e: Schema.optionalWith(Schema.String, { exact: true }),
  a: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteLiveSubscribeMessageSchema = Schema.Struct({
  protocol: Schema.String,
  type: Schema.Literal("subscribe"),
  id: Schema.optionalWith(Schema.String, { exact: true }),
  e: Schema.optionalWith(Schema.String, { exact: true }),
  a: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteLiveUnsubscribeMessageSchema = Schema.Struct({
  protocol: Schema.String,
  type: Schema.Literal("unsubscribe"),
  id: Schema.String,
});

export const DurableObjectSqliteLiveClientMessageSchema = Schema.Union(
  DurableObjectSqliteLiveSubscribeMessageSchema,
  DurableObjectSqliteLiveUnsubscribeMessageSchema,
);

export const DurableObjectSqliteLiveQuerySubscribeMessageSchema = Schema.Struct({
  protocol: Schema.String,
  type: Schema.Literal("query.subscribe"),
  id: Schema.optionalWith(Schema.String, { exact: true }),
  query: DatalogQueryArgs,
});

export const DurableObjectSqliteLiveQueryUnsubscribeMessageSchema =
  Schema.Struct({
    protocol: Schema.String,
    type: Schema.Literal("query.unsubscribe"),
    id: Schema.String,
  });

export const DurableObjectSqliteLiveQueryHydrateMessageSchema = Schema.Struct({
  protocol: Schema.String,
  type: Schema.Literal("query.hydrate"),
  connectionId: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteLiveQueryClientMessageSchema = Schema.Union(
  DurableObjectSqliteLiveQuerySubscribeMessageSchema,
  DurableObjectSqliteLiveQueryUnsubscribeMessageSchema,
  DurableObjectSqliteLiveQueryHydrateMessageSchema,
);

export type DurableObjectSqliteLiveSubscriptionFilter =
  typeof DurableObjectSqliteLiveSubscriptionFilterSchema.Type;
export type DurableObjectSqliteLiveSubscribeMessage =
  typeof DurableObjectSqliteLiveSubscribeMessageSchema.Type;
export type DurableObjectSqliteLiveUnsubscribeMessage =
  typeof DurableObjectSqliteLiveUnsubscribeMessageSchema.Type;
export type DurableObjectSqliteLiveClientMessage =
  typeof DurableObjectSqliteLiveClientMessageSchema.Type;
export type DurableObjectSqliteLiveQuerySubscribeMessage =
  typeof DurableObjectSqliteLiveQuerySubscribeMessageSchema.Type;
export type DurableObjectSqliteLiveQueryUnsubscribeMessage =
  typeof DurableObjectSqliteLiveQueryUnsubscribeMessageSchema.Type;
export type DurableObjectSqliteLiveQueryHydrateMessage =
  typeof DurableObjectSqliteLiveQueryHydrateMessageSchema.Type;
export type DurableObjectSqliteLiveQueryClientMessage =
  typeof DurableObjectSqliteLiveQueryClientMessageSchema.Type;

export type DurableObjectSqliteLiveServerMessage =
  | {
      readonly protocol: string;
      readonly type: "subscribed";
      readonly id: string;
      readonly filter: DurableObjectSqliteLiveSubscriptionFilter;
    }
  | {
      readonly protocol: string;
      readonly type: "unsubscribed";
      readonly id: string;
    }
  | {
      readonly protocol: string;
      readonly type: "invalidate";
      readonly from: string;
      readonly subscriptions: readonly string[];
      readonly changed: readonly DurableObjectSqliteProjectionChange[];
    };

export type DurableObjectSqliteLiveConnection = {
  readonly id: string;
  close(code?: number, reason?: string): void;
};

export type DurableObjectSqliteLiveQueryServerMessage =
  | {
      readonly protocol: string;
      readonly type: "query.subscribed";
      readonly from: string;
      readonly id: string;
      readonly dependencies: readonly DurableObjectSqliteLiveSubscriptionFilter[];
      readonly result: DatalogQueryResult;
    }
  | {
      readonly protocol: string;
      readonly type: "query.updated";
      readonly from: string;
      readonly id: string;
      readonly changed: readonly DurableObjectSqliteProjectionChange[];
      readonly result: DatalogQueryResult;
    }
  | {
      readonly protocol: string;
      readonly type: "query.unsubscribed";
      readonly from: string;
      readonly id: string;
    };

export type DurableObjectSqliteLiveSubscription = {
  readonly id: string;
  readonly connectionId: string;
  readonly filter: DurableObjectSqliteLiveSubscriptionFilter;
};

export type DurableObjectSqliteLivePublishResult = {
  readonly changed: readonly DurableObjectSqliteProjectionChange[];
  readonly delivered: number;
  readonly subscriptions: readonly string[];
};

export type DurableObjectSqliteLiveFanoutOptions = {
  readonly protocol?: string;
  readonly from: string;
};

export type DurableObjectSqliteLiveQuerySubscription = {
  readonly id: string;
  readonly connectionId: string;
  readonly query: DatalogQueryArgsType;
  readonly dependencies: readonly DurableObjectSqliteLiveSubscriptionFilter[];
};

export type DurableObjectSqliteLiveQueryPublishResult = {
  readonly changed: readonly DurableObjectSqliteProjectionChange[];
  readonly delivered: number;
  readonly subscriptions: readonly string[];
};

export type DurableObjectSqliteLiveQueryHydrateResult = {
  readonly connectionId: string;
  readonly hydrated: number;
  readonly subscriptions: readonly string[];
};

export type DurableObjectSqliteLiveQueryOptions = {
  readonly protocol?: string;
  readonly from: string;
  readonly queryCurrent: (
    args: DatalogQueryArgsType,
  ) => Promise<DatalogQueryResult>;
  readonly subscriptions?: DurableObjectSqliteLiveQuerySubscriptionStore;
  readonly now?: () => number;
  readonly scope?: string;
};

function liveError(operation: string, cause: unknown): DurableObjectSqliteLiveError {
  return new DurableObjectSqliteLiveError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function decode<A, I>(
  operation: string,
  schema: Schema.Schema<A, I>,
  input: unknown,
): Effect.Effect<A, DurableObjectSqliteLiveError> {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(schema)(input),
    catch: (cause) => liveError(operation, cause),
  });
}

function parseMessage(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return JSON.parse(raw) as unknown;
}

function objectProtocol(raw: unknown): unknown {
  return typeof raw === "object" && raw !== null && "protocol" in raw
    ? (raw as { protocol?: unknown }).protocol
    : undefined;
}

function serialize(message: DurableObjectSqliteLiveServerMessage): string {
  return JSON.stringify(message);
}

function serializeQuery(
  message: DurableObjectSqliteLiveQueryServerMessage,
): string {
  return JSON.stringify(message);
}

function assertBoundedFilter(
  operation: string,
  filter: DurableObjectSqliteLiveSubscriptionFilter,
): Effect.Effect<void, DurableObjectSqliteLiveError> {
  if (filter.e !== undefined || filter.a !== undefined) return Effect.void;
  return Effect.fail(
    liveError(operation, new Error("live subscription requires e or a")),
  );
}

function compactFilter(
  filter: DurableObjectSqliteLiveSubscriptionFilter,
): DurableObjectSqliteLiveSubscriptionFilter {
  return {
    ...(filter.e === undefined ? {} : { e: filter.e }),
    ...(filter.a === undefined ? {} : { a: filter.a }),
  };
}

function matches(
  filter: DurableObjectSqliteLiveSubscriptionFilter,
  change: DurableObjectSqliteProjectionChange,
): boolean {
  if (filter.e !== undefined && filter.e !== change.e) return false;
  if (filter.a !== undefined && filter.a !== change.a) return false;
  return true;
}

function sortedChanges(
  changed: readonly DurableObjectSqliteProjectionChange[],
): DurableObjectSqliteProjectionChange[] {
  return [...changed].sort((a, b) =>
    a.e === b.e ? a.a.localeCompare(b.a) : a.e.localeCompare(b.e)
  );
}

function dedupeFilters(
  filters: Iterable<DurableObjectSqliteLiveSubscriptionFilter>,
): DurableObjectSqliteLiveSubscriptionFilter[] {
  return [
    ...new Map(
      [...filters].map((filter) => [
        `${filter.e ?? "*"}\u0000${filter.a ?? "*"}`,
        compactFilter(filter),
      ]),
    ).values(),
  ].sort((left, right) => {
    const leftKey = `${left.e ?? ""}\u0000${left.a ?? ""}`;
    const rightKey = `${right.e ?? ""}\u0000${right.a ?? ""}`;
    return leftKey.localeCompare(rightKey);
  });
}

function patternDependency(
  pattern: PatternClause,
): DurableObjectSqliteLiveSubscriptionFilter | undefined {
  const e = pattern.e.kind === "const" && typeof pattern.e.value === "string"
    ? pattern.e.value
    : undefined;
  const a = pattern.a.kind === "const" && typeof pattern.a.value === "string"
    ? pattern.a.value
    : undefined;
  return e === undefined && a === undefined ? undefined : compactFilter({ e, a });
}

function clauseDependencies(
  clause: AnyClause,
): DurableObjectSqliteLiveSubscriptionFilter[] {
  if (clause.kind === "pattern") {
    const dependency = patternDependency(clause);
    return dependency === undefined ? [] : [dependency];
  }
  if (clause.kind === "not") {
    const dependency = patternDependency(clause.pattern);
    return dependency === undefined ? [] : [dependency];
  }
  if (clause.kind === "or") {
    return clause.branches.flatMap((branch) =>
      branch.flatMap(clauseDependencies)
    );
  }
  return [];
}

export function durableObjectSqliteLiveQueryDependenciesEffect(
  args: DatalogQueryArgsType,
): Effect.Effect<
  readonly DurableObjectSqliteLiveSubscriptionFilter[],
  DurableObjectSqliteLiveError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "liveQueryDependencies.args",
      DatalogQueryArgs,
      args,
    );
    const dependencies = yield* Effect.try({
      try: () =>
        dedupeFilters(parseClauses([...decoded.where]).flatMap(clauseDependencies)),
      catch: (cause) => liveError("liveQueryDependencies.parse", cause),
    });
    if (dependencies.length === 0) {
      return yield* Effect.fail(
        liveError(
          "liveQueryDependencies",
          new Error("live query requires at least one bounded e or a pattern"),
        ),
      );
    }
    return dependencies;
  });
}

export function durableObjectSqliteLiveQueryDependencies(
  args: DatalogQueryArgsType,
): Promise<readonly DurableObjectSqliteLiveSubscriptionFilter[]> {
  return Effect.runPromise(durableObjectSqliteLiveQueryDependenciesEffect(args));
}

export class DurableObjectSqliteLiveInvalidationFanout {
  readonly protocol: string;
  readonly from: string;
  #nextConnection = 0;
  #nextSubscription = 0;
  #connections = new Map<
    string,
    {
      socket: WebSocketLike;
      onMessage: (event: MessageEventLike) => void;
      onClose: (event: CloseEventLike) => void;
    }
  >();
  #subscriptions = new Map<string, DurableObjectSqliteLiveSubscription>();

  constructor(options: DurableObjectSqliteLiveFanoutOptions) {
    this.protocol = options.protocol ?? DEFAULT_PROTOCOL;
    this.from = options.from;
  }

  get size(): number {
    return this.#connections.size;
  }

  get subscriptionCount(): number {
    return this.#subscriptions.size;
  }

  connect(
    socket: WebSocketLike,
    id = `live:${++this.#nextConnection}`,
  ): DurableObjectSqliteLiveConnection {
    socket.accept?.();
    const onMessage = (event: MessageEventLike) => {
      void this.#handle(id, event.data);
    };
    const onClose = () => {
      this.disconnect(id);
    };
    socket.addEventListener?.("message", onMessage);
    socket.addEventListener?.("close", onClose);
    socket.addEventListener?.("error", onClose);
    this.#connections.set(id, { socket, onMessage, onClose });
    return {
      id,
      close: (code?: number, reason?: string) => {
        this.disconnect(id);
        socket.close?.(code, reason);
      },
    };
  }

  disconnect(id: string): void {
    const connection = this.#connections.get(id);
    if (!connection) return;
    connection.socket.removeEventListener?.("message", connection.onMessage);
    connection.socket.removeEventListener?.("close", connection.onClose);
    connection.socket.removeEventListener?.("error", connection.onClose);
    this.#connections.delete(id);
    for (const [subscriptionId, subscription] of this.#subscriptions) {
      if (subscription.connectionId === id) {
        this.#subscriptions.delete(subscriptionId);
      }
    }
  }

  subscribe(
    connectionId: string,
    filter: DurableObjectSqliteLiveSubscriptionFilter,
    id = `sub:${++this.#nextSubscription}`,
  ): Promise<DurableObjectSqliteLiveSubscription> {
    return Effect.runPromise(this.subscribeEffect(connectionId, filter, id));
  }

  subscribeEffect(
    connectionId: string,
    filter: DurableObjectSqliteLiveSubscriptionFilter,
    id = `sub:${++this.#nextSubscription}`,
  ): Effect.Effect<
    DurableObjectSqliteLiveSubscription,
    DurableObjectSqliteLiveError
  > {
    const self = this;
    return Effect.gen(function* () {
      const decoded = yield* decode(
        "subscribeLiveInvalidations",
        DurableObjectSqliteLiveSubscriptionFilterSchema,
        compactFilter(filter),
      );
      yield* assertBoundedFilter("subscribeLiveInvalidations", decoded);
      const connection = self.#connections.get(connectionId);
      if (connection === undefined) {
        return yield* Effect.fail(
          liveError(
            "subscribeLiveInvalidations",
            new Error(`unknown live connection: ${connectionId}`),
          ),
        );
      }
      const subscription = { id, connectionId, filter: decoded };
      self.#subscriptions.set(id, subscription);
      yield* Effect.try({
        try: () =>
          connection.socket.send(
            serialize({
              protocol: self.protocol,
              type: "subscribed",
              id,
              filter: decoded,
            }),
          ),
        catch: (cause) => liveError("subscribeLiveInvalidations", cause),
      });
      return subscription;
    });
  }

  unsubscribe(connectionId: string, id: string): Promise<boolean> {
    return Effect.runPromise(this.unsubscribeEffect(connectionId, id));
  }

  unsubscribeEffect(
    connectionId: string,
    id: string,
  ): Effect.Effect<boolean, DurableObjectSqliteLiveError> {
    const self = this;
    return Effect.gen(function* () {
      const subscription = self.#subscriptions.get(id);
      const removed = subscription?.connectionId === connectionId &&
        self.#subscriptions.delete(id);
      const connection = self.#connections.get(connectionId);
      if (connection !== undefined) {
        yield* Effect.try({
          try: () =>
            connection.socket.send(
              serialize({ protocol: self.protocol, type: "unsubscribed", id }),
            ),
          catch: (cause) => liveError("unsubscribeLiveInvalidations", cause),
        });
      }
      return removed === true;
    });
  }

  publishChanges(
    changed: readonly DurableObjectSqliteProjectionChange[],
  ): Promise<DurableObjectSqliteLivePublishResult> {
    return Effect.runPromise(this.publishChangesEffect(changed));
  }

  publishChangesEffect(
    changed: readonly DurableObjectSqliteProjectionChange[],
  ): Effect.Effect<
    DurableObjectSqliteLivePublishResult,
    DurableObjectSqliteLiveError
  > {
    const self = this;
    return Effect.gen(function* () {
      if (changed.length === 0) {
        return { changed, delivered: 0, subscriptions: [] };
      }
      const byConnection = new Map<
        string,
        {
          subscriptions: string[];
          changed: DurableObjectSqliteProjectionChange[];
        }
      >();
      for (const subscription of self.#subscriptions.values()) {
        const matched = changed.filter((change) =>
          matches(subscription.filter, change)
        );
        if (matched.length === 0) continue;
        const bucket = byConnection.get(subscription.connectionId) ?? {
          subscriptions: [],
          changed: [],
        };
        bucket.subscriptions.push(subscription.id);
        for (const change of matched) {
          const alreadyIncluded = bucket.changed.some(
            (existing) => existing.e === change.e && existing.a === change.a,
          );
          if (!alreadyIncluded) {
            bucket.changed.push(change);
          }
        }
        byConnection.set(subscription.connectionId, bucket);
      }

      const deliveredSubscriptions: string[] = [];
      let delivered = 0;
      for (const [connectionId, bucket] of byConnection) {
        const connection = self.#connections.get(connectionId);
        if (connection === undefined) continue;
        const subscriptions = bucket.subscriptions.sort();
        deliveredSubscriptions.push(...subscriptions);
        delivered++;
        yield* Effect.try({
          try: () =>
            connection.socket.send(
              serialize({
                protocol: self.protocol,
                type: "invalidate",
                from: self.from,
                subscriptions,
                changed: bucket.changed.sort((a, b) =>
                  a.e === b.e ? a.a.localeCompare(b.a) : a.e.localeCompare(b.e)
                ),
              }),
            ),
          catch: (cause) => liveError("publishLiveInvalidations", cause),
        });
      }
      return {
        changed,
        delivered,
        subscriptions: deliveredSubscriptions.sort(),
      };
    });
  }

  async #handle(connectionId: string, raw: unknown): Promise<void> {
    let parsed: unknown;
    try {
      parsed = parseMessage(raw);
    } catch {
      this.#connections.get(connectionId)?.socket.close?.(1003, "invalid json");
      this.disconnect(connectionId);
      return;
    }
    if (objectProtocol(parsed) !== this.protocol) return;
    let message: DurableObjectSqliteLiveClientMessage;
    try {
      message = Effect.runSync(
        decode(
          "liveInvalidationMessage",
          DurableObjectSqliteLiveClientMessageSchema,
          parsed,
        ),
      );
    } catch {
      this.#connections.get(connectionId)?.socket.close?.(
        1003,
        "invalid live message",
      );
      this.disconnect(connectionId);
      return;
    }
    if (message.type === "subscribe") {
      const id = message.id ?? `sub:${++this.#nextSubscription}`;
      try {
        await this.subscribe(
          connectionId,
          compactFilter({ e: message.e, a: message.a }),
          id,
        );
      } catch {
        this.#connections.get(connectionId)?.socket.close?.(
          1003,
          "invalid live subscription",
        );
        this.disconnect(connectionId);
      }
    } else {
      try {
        await this.unsubscribe(connectionId, message.id);
      } catch {
        this.#connections.get(connectionId)?.socket.close?.(
          1011,
          "live unsubscribe failed",
        );
        this.disconnect(connectionId);
      }
    }
  }
}

export class DurableObjectSqliteLiveCurrentQueryFanout {
  readonly protocol: string;
  readonly from: string;
  #nextConnection = 0;
  #nextSubscription = 0;
  #connections = new Map<
    string,
    {
      socket: WebSocketLike;
      onMessage: (event: MessageEventLike) => void;
      onClose: (event: CloseEventLike) => void;
    }
  >();
  #subscriptions = new Map<string, DurableObjectSqliteLiveQuerySubscription>();
  #queryCurrent: (args: DatalogQueryArgsType) => Promise<DatalogQueryResult>;
  #persistedSubscriptions?: DurableObjectSqliteLiveQuerySubscriptionStore;
  #now: () => number;
  #scope?: string;

  constructor(options: DurableObjectSqliteLiveQueryOptions) {
    this.protocol = options.protocol ?? DEFAULT_QUERY_PROTOCOL;
    this.from = options.from;
    this.#queryCurrent = options.queryCurrent;
    this.#persistedSubscriptions = options.subscriptions;
    this.#now = options.now ?? (() => Date.now());
    this.#scope = options.scope;
  }

  get size(): number {
    return this.#connections.size;
  }

  get subscriptionCount(): number {
    return this.#subscriptions.size;
  }

  connect(
    socket: WebSocketLike,
    id = `live-query:${++this.#nextConnection}`,
  ): DurableObjectSqliteLiveConnection {
    socket.accept?.();
    const onMessage = (event: MessageEventLike) => {
      void this.#handle(id, event.data);
    };
    const onClose = () => {
      this.disconnect(id);
    };
    socket.addEventListener?.("message", onMessage);
    socket.addEventListener?.("close", onClose);
    socket.addEventListener?.("error", onClose);
    this.#connections.set(id, { socket, onMessage, onClose });
    return {
      id,
      close: (code?: number, reason?: string) => {
        this.disconnect(id);
        socket.close?.(code, reason);
      },
    };
  }

  disconnect(id: string): void {
    const connection = this.#connections.get(id);
    if (!connection) return;
    connection.socket.removeEventListener?.("message", connection.onMessage);
    connection.socket.removeEventListener?.("close", connection.onClose);
    connection.socket.removeEventListener?.("error", connection.onClose);
    this.#connections.delete(id);
    for (const [subscriptionId, subscription] of this.#subscriptions) {
      if (subscription.connectionId === id) {
        this.#subscriptions.delete(subscriptionId);
      }
    }
    void this.#persistedSubscriptions?.closeByConnection(id, this.#now());
  }

  subscribeQuery(
    connectionId: string,
    query: DatalogQueryArgsType,
    id = `query:${++this.#nextSubscription}`,
  ): Promise<DurableObjectSqliteLiveQuerySubscription> {
    return Effect.runPromise(this.subscribeQueryEffect(connectionId, query, id));
  }

  subscribeQueryEffect(
    connectionId: string,
    query: DatalogQueryArgsType,
    id = `query:${++this.#nextSubscription}`,
  ): Effect.Effect<
    DurableObjectSqliteLiveQuerySubscription,
    DurableObjectSqliteLiveError
  > {
    const self = this;
    return Effect.gen(function* () {
      const decoded = yield* decode(
        "subscribeLiveCurrentQuery.args",
        DatalogQueryArgs,
        query,
      );
      const dependencies = yield* durableObjectSqliteLiveQueryDependenciesEffect(
        decoded,
      );
      const connection = self.#connections.get(connectionId);
      if (connection === undefined) {
        return yield* Effect.fail(
          liveError(
            "subscribeLiveCurrentQuery",
            new Error(`unknown live query connection: ${connectionId}`),
          ),
        );
      }
      const result = yield* self.#runQuery(decoded);
      const subscription = { id, connectionId, query: decoded, dependencies };
      self.#subscriptions.set(id, subscription);
      if (self.#persistedSubscriptions !== undefined) {
        const now = self.#now();
        yield* Effect.tryPromise({
          try: () =>
            self.#persistedSubscriptions!.upsert({
              id,
              connectionId,
              protocol: self.protocol,
              query: decoded,
              dependencies,
              createdAt: now,
              updatedAt: now,
              ...(self.#scope === undefined ? {} : { scope: self.#scope }),
            }),
          catch: (cause) =>
            liveError("subscribeLiveCurrentQuery.persist", cause),
        });
      }
      yield* Effect.try({
        try: () =>
          connection.socket.send(
            serializeQuery({
              protocol: self.protocol,
              type: "query.subscribed",
              from: self.from,
              id,
              dependencies,
              result,
            }),
          ),
        catch: (cause) => liveError("subscribeLiveCurrentQuery.send", cause),
      });
      return subscription;
    });
  }

  unsubscribeQuery(connectionId: string, id: string): Promise<boolean> {
    return Effect.runPromise(this.unsubscribeQueryEffect(connectionId, id));
  }

  unsubscribeQueryEffect(
    connectionId: string,
    id: string,
  ): Effect.Effect<boolean, DurableObjectSqliteLiveError> {
    const self = this;
    return Effect.gen(function* () {
      const subscription = self.#subscriptions.get(id);
      const removed = subscription?.connectionId === connectionId &&
        self.#subscriptions.delete(id);
      if (removed === true && self.#persistedSubscriptions !== undefined) {
        yield* Effect.tryPromise({
          try: () => self.#persistedSubscriptions!.close(id, self.#now()),
          catch: (cause) =>
            liveError("unsubscribeLiveCurrentQuery.persist", cause),
        });
      }
      const connection = self.#connections.get(connectionId);
      if (connection !== undefined) {
        yield* Effect.try({
          try: () =>
            connection.socket.send(
              serializeQuery({
                protocol: self.protocol,
                type: "query.unsubscribed",
                from: self.from,
                id,
              }),
            ),
          catch: (cause) => liveError("unsubscribeLiveCurrentQuery", cause),
        });
      }
      return removed === true;
    });
  }

  publishChanges(
    changed: readonly DurableObjectSqliteProjectionChange[],
  ): Promise<DurableObjectSqliteLiveQueryPublishResult> {
    return Effect.runPromise(this.publishChangesEffect(changed));
  }

  hydrateConnection(
    connectionId: string,
  ): Promise<DurableObjectSqliteLiveQueryHydrateResult> {
    return Effect.runPromise(this.hydrateConnectionEffect(connectionId));
  }

  hydrateConnectionEffect(
    connectionId: string,
  ): Effect.Effect<
    DurableObjectSqliteLiveQueryHydrateResult,
    DurableObjectSqliteLiveError
  > {
    const self = this;
    return Effect.gen(function* () {
      const store = self.#persistedSubscriptions;
      if (store === undefined) {
        return yield* Effect.fail(
          liveError(
            "hydrateLiveCurrentQuery",
            new Error("live query hydration requires persisted subscriptions"),
          ),
        );
      }
      const connection = self.#connections.get(connectionId);
      if (connection === undefined) {
        return yield* Effect.fail(
          liveError(
            "hydrateLiveCurrentQuery",
            new Error(`unknown live query connection: ${connectionId}`),
          ),
        );
      }
      const rows = yield* Effect.tryPromise({
        try: () => store.list({ connectionId, status: "active" }),
        catch: (cause) => liveError("hydrateLiveCurrentQuery.list", cause),
      });
      const matching = rows
        .filter((row) =>
          row.protocol === self.protocol &&
          (self.#scope === undefined || row.scope === self.#scope)
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const hydrated: string[] = [];
      for (const row of matching) {
        const query = yield* decode(
          "hydrateLiveCurrentQuery.query",
          DatalogQueryArgs,
          row.query,
        );
        const dependencies = row.dependencies.map(compactFilter);
        const result = yield* self.#runQuery(query);
        self.#subscriptions.set(row.id, {
          id: row.id,
          connectionId,
          query,
          dependencies,
        });
        yield* Effect.try({
          try: () =>
            connection.socket.send(
              serializeQuery({
                protocol: self.protocol,
                type: "query.subscribed",
                from: self.from,
                id: row.id,
                dependencies,
                result,
              }),
            ),
          catch: (cause) => liveError("hydrateLiveCurrentQuery.send", cause),
        });
        hydrated.push(row.id);
      }
      return {
        connectionId,
        hydrated: hydrated.length,
        subscriptions: hydrated,
      };
    });
  }

  publishChangesEffect(
    changed: readonly DurableObjectSqliteProjectionChange[],
  ): Effect.Effect<
    DurableObjectSqliteLiveQueryPublishResult,
    DurableObjectSqliteLiveError
  > {
    const self = this;
    return Effect.gen(function* () {
      if (changed.length === 0) {
        return { changed, delivered: 0, subscriptions: [] };
      }
      const delivered: string[] = [];
      for (const subscription of [...self.#subscriptions.values()].sort((a, b) =>
        a.id.localeCompare(b.id)
      )) {
        const matched = sortedChanges(
          changed.filter((change) =>
            subscription.dependencies.some((filter) => matches(filter, change))
          ),
        );
        if (matched.length === 0) continue;
        const connection = self.#connections.get(subscription.connectionId);
        if (connection === undefined) continue;
        const result = yield* self.#runQuery(subscription.query);
        yield* Effect.try({
          try: () =>
            connection.socket.send(
              serializeQuery({
                protocol: self.protocol,
                type: "query.updated",
                from: self.from,
                id: subscription.id,
                changed: matched,
                result,
              }),
            ),
          catch: (cause) => liveError("publishLiveCurrentQuery", cause),
        });
        delivered.push(subscription.id);
      }
      return { changed, delivered: delivered.length, subscriptions: delivered };
    });
  }

  #runQuery(
    args: DatalogQueryArgsType,
  ): Effect.Effect<DatalogQueryResult, DurableObjectSqliteLiveError> {
    return Effect.tryPromise({
      try: () => this.#queryCurrent(args),
      catch: (cause) => liveError("liveCurrentQuery.queryCurrent", cause),
    });
  }

  async #handle(connectionId: string, raw: unknown): Promise<void> {
    let parsed: unknown;
    try {
      parsed = parseMessage(raw);
    } catch {
      this.#connections.get(connectionId)?.socket.close?.(1003, "invalid json");
      this.disconnect(connectionId);
      return;
    }
    if (objectProtocol(parsed) !== this.protocol) return;
    let message: DurableObjectSqliteLiveQueryClientMessage;
    try {
      message = Effect.runSync(
        decode(
          "liveCurrentQueryMessage",
          DurableObjectSqliteLiveQueryClientMessageSchema,
          parsed,
        ),
      );
    } catch {
      this.#connections.get(connectionId)?.socket.close?.(
        1003,
        "invalid live query message",
      );
      this.disconnect(connectionId);
      return;
    }
    if (message.type === "query.subscribe") {
      const id = message.id ?? `query:${++this.#nextSubscription}`;
      try {
        await this.subscribeQuery(connectionId, message.query, id);
      } catch {
        this.#connections.get(connectionId)?.socket.close?.(
          1003,
          "invalid live query subscription",
        );
        this.disconnect(connectionId);
      }
    } else if (message.type === "query.unsubscribe") {
      try {
        await this.unsubscribeQuery(connectionId, message.id);
      } catch {
        this.#connections.get(connectionId)?.socket.close?.(
          1011,
          "live query unsubscribe failed",
        );
        this.disconnect(connectionId);
      }
    } else {
      try {
        await this.hydrateConnection(message.connectionId ?? connectionId);
      } catch {
        this.#connections.get(connectionId)?.socket.close?.(
          1011,
          "live query hydrate failed",
        );
        this.disconnect(connectionId);
      }
    }
  }
}

export function publishDurableObjectSqliteLiveInvalidationsEffect(
  fanout: DurableObjectSqliteLiveInvalidationFanout,
  changed: readonly DurableObjectSqliteProjectionChange[],
): Effect.Effect<
  DurableObjectSqliteLivePublishResult,
  DurableObjectSqliteLiveError
> {
  return fanout.publishChangesEffect(changed);
}

export function publishDurableObjectSqliteLiveInvalidations(
  fanout: DurableObjectSqliteLiveInvalidationFanout,
  changed: readonly DurableObjectSqliteProjectionChange[],
): Promise<DurableObjectSqliteLivePublishResult> {
  return fanout.publishChanges(changed);
}

export function publishDurableObjectSqliteLiveCurrentQueryChangesEffect(
  fanout: DurableObjectSqliteLiveCurrentQueryFanout,
  changed: readonly DurableObjectSqliteProjectionChange[],
): Effect.Effect<
  DurableObjectSqliteLiveQueryPublishResult,
  DurableObjectSqliteLiveError
> {
  return fanout.publishChangesEffect(changed);
}

export function publishDurableObjectSqliteLiveCurrentQueryChanges(
  fanout: DurableObjectSqliteLiveCurrentQueryFanout,
  changed: readonly DurableObjectSqliteProjectionChange[],
): Promise<DurableObjectSqliteLiveQueryPublishResult> {
  return fanout.publishChanges(changed);
}
