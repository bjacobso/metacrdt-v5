import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import type { WebSocketLike } from "./relay.js";
import type { DurableObjectSqliteProjectionChange } from "./sqliteCurrent.js";

const DEFAULT_PROTOCOL = "metacrdt.cloudflare.sqlite.live.v1";

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

export type DurableObjectSqliteLiveSubscriptionFilter =
  typeof DurableObjectSqliteLiveSubscriptionFilterSchema.Type;
export type DurableObjectSqliteLiveSubscribeMessage =
  typeof DurableObjectSqliteLiveSubscribeMessageSchema.Type;
export type DurableObjectSqliteLiveUnsubscribeMessage =
  typeof DurableObjectSqliteLiveUnsubscribeMessageSchema.Type;
export type DurableObjectSqliteLiveClientMessage =
  typeof DurableObjectSqliteLiveClientMessageSchema.Type;

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
