import {
  type Event,
  type EventId,
  type Hlc,
  initialClock,
  receive,
  tick,
  verifyId,
} from "@metacrdt/core";
import {
  RuntimeServiceError,
  runtimeServicesLayer,
  type AppendResult,
  type EventFilter,
  type EventStore,
  type MergeResult,
  type ProjectionFilter,
  type ProjectionReplaceResult,
  type ProjectionRow,
  type ProjectionRuntimeServices,
  type ProjectionStore,
  type RuntimeCapability,
  type RuntimeClock,
  type RuntimeProfile,
  type RuntimeSequencer,
  type RuntimeServices,
} from "@metacrdt/runtime";
import { Effect, Layer } from "effect";

/**
 * Structural subset of Cloudflare Durable Object SQLite used by this adapter.
 *
 * Cloudflare's current API is `ctx.storage.sql.exec(query, ...bindings)`, which
 * returns a synchronous cursor. We consume cursors immediately via `toArray()` or
 * `Array.from(cursor)` before any await, matching Cloudflare's documented cursor
 * snapshot guidance while avoiding a Workers type dependency.
 */
export interface DurableObjectSqlCursorLike extends Iterable<unknown> {
  toArray?(): unknown[];
}

export interface DurableObjectSqlStorageLike {
  exec(query: string, ...bindings: readonly unknown[]): DurableObjectSqlCursorLike;
}

export type DurableObjectSqliteRuntimeOptions = {
  name?: string;
  replicaId: string;
  sql: DurableObjectSqlStorageLike;
  tablePrefix?: string;
  initialize?: boolean;
  wall?: () => number;
  capabilities?: Iterable<RuntimeCapability>;
};

export type DurableObjectSqliteRuntime = RuntimeServices & {
  store: DurableObjectSqliteEventStore;
  projection: DurableObjectSqliteProjectionStore;
  collections: DurableObjectSqliteCollectionStore;
  timers: DurableObjectSqliteTimerStore;
  flowWaitTimers: DurableObjectSqliteFlowWaitTimerStore;
  dag: DurableObjectSqliteDagStore;
  clock: DurableObjectSqliteClock;
  sequencer: DurableObjectSqliteSequencer;
};

export type DurableObjectSqliteCollectionStatus =
  | "issued"
  | "submitted"
  | "expired";

export type DurableObjectSqliteCollection = {
  readonly token: string;
  readonly subject: string;
  readonly form: string;
  readonly status: DurableObjectSqliteCollectionStatus;
  readonly issuedAt: number;
  readonly expiresAt: number | null;
  readonly submittedAt: number | null;
  readonly remindedAt?: number;
  readonly escalatedAt?: number;
  readonly expiredAt?: number;
  readonly data: unknown;
  readonly runId?: string;
  readonly stepId?: string;
  readonly scope?: string;
};

export type DurableObjectSqliteCollectionTickPhase =
  | "reminder"
  | "escalation"
  | "expire";

export type DurableObjectSqliteCollectionTickStatus =
  | "pending"
  | "fired"
  | "skipped";

export type DurableObjectSqliteCollectionTick = {
  readonly id: string;
  readonly token: string;
  readonly phase: DurableObjectSqliteCollectionTickPhase;
  readonly fireAt: number;
  readonly status: DurableObjectSqliteCollectionTickStatus;
  readonly scheduledAt: number;
  readonly firedAt: number | null;
  readonly reason?: string;
};

export type DurableObjectSqliteIssueCollectionInput = {
  readonly token: string;
  readonly subject: string;
  readonly form: string;
  readonly issuedAt: number;
  readonly expiresAt?: number | null;
  readonly runId?: string;
  readonly stepId?: string;
  readonly scope?: string;
};

export type DurableObjectSqliteSubmitCollectionInput = {
  readonly token: string;
  readonly submittedAt: number;
  readonly data?: unknown;
};

export type DurableObjectSqliteCollectionFilter = {
  readonly subject?: string;
  readonly status?: DurableObjectSqliteCollectionStatus;
  readonly limit?: number;
};

export type DurableObjectSqliteScheduleCollectionTickInput = {
  readonly id: string;
  readonly token: string;
  readonly phase: DurableObjectSqliteCollectionTickPhase;
  readonly fireAt: number;
  readonly scheduledAt: number;
};

export type DurableObjectSqliteCollectionTickFilter = {
  readonly token?: string;
  readonly phase?: DurableObjectSqliteCollectionTickPhase;
  readonly status?: DurableObjectSqliteCollectionTickStatus;
  readonly dueAt?: number;
  readonly limit?: number;
};

export type DurableObjectSqliteFlowWaitTickStatus =
  | "pending"
  | "fired"
  | "skipped";

export type DurableObjectSqliteFlowWaitTick = {
  readonly id: string;
  readonly runId: string;
  readonly stepId: string;
  readonly eventId: string;
  readonly fireAt: number;
  readonly status: DurableObjectSqliteFlowWaitTickStatus;
  readonly scheduledAt: number;
  readonly firedAt: number | null;
  readonly reason?: string;
};

export type DurableObjectSqliteScheduleFlowWaitTickInput = {
  readonly id: string;
  readonly runId: string;
  readonly stepId: string;
  readonly eventId: string;
  readonly fireAt: number;
  readonly scheduledAt: number;
};

export type DurableObjectSqliteFlowWaitTickFilter = {
  readonly runId?: string;
  readonly stepId?: string;
  readonly status?: DurableObjectSqliteFlowWaitTickStatus;
  readonly dueAt?: number;
  readonly limit?: number;
};

export type DurableObjectSqliteDagRunStatus =
  | "running"
  | "waiting"
  | "completed"
  | "unsupported";

export type DurableObjectSqliteDagEventInput = {
  readonly eventId: string;
  readonly stepId: string;
  readonly type: string;
  readonly kind: string;
  readonly message?: string;
};

export type DurableObjectSqliteDagEvent = DurableObjectSqliteDagEventInput & {
  readonly runId: string;
  readonly ts: number;
};

export type DurableObjectSqliteDagRun = {
  readonly runId: string;
  readonly flowDefName: string;
  readonly subject: string;
  readonly status: DurableObjectSqliteDagRunStatus;
  readonly currentStepId?: string;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly completedAt?: number;
  readonly context?: unknown;
  readonly events: readonly DurableObjectSqliteDagEvent[];
};

export type DurableObjectSqliteRecordDagRunInput = {
  readonly runId?: string;
  readonly flowDefName: string;
  readonly subject: string;
  readonly status: DurableObjectSqliteDagRunStatus;
  readonly currentStepId?: string;
  readonly context?: unknown;
  readonly events: readonly DurableObjectSqliteDagEventInput[];
  readonly now: number;
};

export type DurableObjectSqliteDagRunFilter = {
  readonly subject?: string;
  readonly status?: DurableObjectSqliteDagRunStatus;
  readonly limit?: number;
};

type SqlPlan = {
  prefix: string;
  tables: {
    events: string;
    meta: string;
    projection: string;
    collections: string;
    timers: string;
    flowWaitTimers: string;
    flowDagRuns: string;
    flowDagEvents: string;
  };
  indexes: {
    eventsByEntity: string;
    eventsByAttribute: string;
    eventsByTarget: string;
    projectionByEntity: string;
    projectionByAttribute: string;
    projectionByEventId: string;
    collectionsBySubject: string;
    collectionsByStatus: string;
    collectionsByExpiresAt: string;
    timersByToken: string;
    timersByStatusFireAt: string;
    timersByPhase: string;
    flowWaitTimersByRun: string;
    flowWaitTimersByStatusFireAt: string;
    flowWaitTimersByStep: string;
    dagRunsBySubject: string;
    dagRunsBySubjectFlowStatus: string;
    dagRunsByStatus: string;
    dagRunsByUpdatedAt: string;
    dagEventsByRun: string;
  };
};

function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function plan(prefix = "metacrdt"): SqlPlan {
  return {
    prefix,
    tables: {
      events: identifier(`${prefix}_events`),
      meta: identifier(`${prefix}_meta`),
      projection: identifier(`${prefix}_projection`),
      collections: identifier(`${prefix}_collections`),
      timers: identifier(`${prefix}_timers`),
      flowWaitTimers: identifier(`${prefix}_flow_wait_timers`),
      flowDagRuns: identifier(`${prefix}_flow_dag_runs`),
      flowDagEvents: identifier(`${prefix}_flow_dag_events`),
    },
    indexes: {
      eventsByEntity: identifier(`${prefix}_events_by_e`),
      eventsByAttribute: identifier(`${prefix}_events_by_a`),
      eventsByTarget: identifier(`${prefix}_events_by_target`),
      projectionByEntity: identifier(`${prefix}_projection_by_e`),
      projectionByAttribute: identifier(`${prefix}_projection_by_a`),
      projectionByEventId: identifier(`${prefix}_projection_by_event_id`),
      collectionsBySubject: identifier(`${prefix}_collections_by_subject`),
      collectionsByStatus: identifier(`${prefix}_collections_by_status`),
      collectionsByExpiresAt: identifier(`${prefix}_collections_by_expires_at`),
      timersByToken: identifier(`${prefix}_timers_by_token`),
      timersByStatusFireAt: identifier(`${prefix}_timers_by_status_fire_at`),
      timersByPhase: identifier(`${prefix}_timers_by_phase`),
      flowWaitTimersByRun: identifier(`${prefix}_flow_wait_timers_by_run`),
      flowWaitTimersByStatusFireAt: identifier(
        `${prefix}_flow_wait_timers_by_status_fire_at`,
      ),
      flowWaitTimersByStep: identifier(`${prefix}_flow_wait_timers_by_step`),
      dagRunsBySubject: identifier(`${prefix}_flow_dag_runs_by_subject`),
      dagRunsBySubjectFlowStatus: identifier(
        `${prefix}_flow_dag_runs_by_subject_flow_status`,
      ),
      dagRunsByStatus: identifier(`${prefix}_flow_dag_runs_by_status`),
      dagRunsByUpdatedAt: identifier(`${prefix}_flow_dag_runs_by_updated_at`),
      dagEventsByRun: identifier(`${prefix}_flow_dag_events_by_run`),
    },
  };
}

function addColumnIfMissing(
  sql: DurableObjectSqlStorageLike,
  table: string,
  columnSql: string,
): void {
  try {
    sql.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!/duplicate column|already exists/i.test(message)) throw cause;
  }
}

function rows(cursor: DurableObjectSqlCursorLike): unknown[] {
  return cursor.toArray ? cursor.toArray() : Array.from(cursor);
}

function valueColumn(row: unknown, key: string): string | undefined {
  if (row === undefined || row === null) return undefined;
  if (typeof row === "string") return row;
  if (Array.isArray(row)) return typeof row[0] === "string" ? row[0] : undefined;
  if (typeof row === "object") {
    const value = (row as Record<string, unknown>)[key] ??
      (row as Record<string, unknown>).value;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function decodeEvent(row: unknown): Event | undefined {
  const raw = valueColumn(row, "event_json");
  if (raw === undefined) return undefined;
  const event = JSON.parse(raw) as Event;
  if (!verifyId(event)) throw new Error(`invalid stored event id: ${event.id}`);
  return event;
}

function decodeProjectionRow(row: unknown): ProjectionRow | undefined {
  const raw = valueColumn(row, "row_json");
  return raw === undefined ? undefined : (JSON.parse(raw) as ProjectionRow);
}

function textColumn(row: unknown, key: string): string | undefined {
  if (row === undefined || row === null || typeof row !== "object") {
    return undefined;
  }
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function numberColumn(row: unknown, key: string): number | null | undefined {
  if (row === undefined || row === null || typeof row !== "object") {
    return undefined;
  }
  const value = (row as Record<string, unknown>)[key];
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function collectionStatus(
  value: string | undefined,
): DurableObjectSqliteCollectionStatus | undefined {
  return value === "issued" || value === "submitted" || value === "expired"
    ? value
    : undefined;
}

function collectionTickPhase(
  value: string | undefined,
): DurableObjectSqliteCollectionTickPhase | undefined {
  return value === "reminder" || value === "escalation" || value === "expire"
    ? value
    : undefined;
}

function collectionTickStatus(
  value: string | undefined,
): DurableObjectSqliteCollectionTickStatus | undefined {
  return value === "pending" || value === "fired" || value === "skipped"
    ? value
    : undefined;
}

function flowWaitTickStatus(
  value: string | undefined,
): DurableObjectSqliteFlowWaitTickStatus | undefined {
  return value === "pending" || value === "fired" || value === "skipped"
    ? value
    : undefined;
}

function dagRunStatus(
  value: string | undefined,
): DurableObjectSqliteDagRunStatus | undefined {
  return value === "running" ||
    value === "waiting" ||
    value === "completed" ||
    value === "unsupported"
    ? value
    : undefined;
}

function decodeCollection(
  row: unknown,
): DurableObjectSqliteCollection | undefined {
  const token = textColumn(row, "token");
  const subject = textColumn(row, "subject");
  const form = textColumn(row, "form");
  const status = collectionStatus(textColumn(row, "status"));
  const issuedAt = numberColumn(row, "issued_at");
  const expiresAt = numberColumn(row, "expires_at");
  const submittedAt = numberColumn(row, "submitted_at");
  const remindedAt = numberColumn(row, "reminded_at");
  const escalatedAt = numberColumn(row, "escalated_at");
  const expiredAt = numberColumn(row, "expired_at");
  if (
    token === undefined ||
    subject === undefined ||
    form === undefined ||
    status === undefined ||
    issuedAt === undefined ||
    issuedAt === null ||
    expiresAt === undefined ||
    submittedAt === undefined
  ) {
    return undefined;
  }
  const dataJson = textColumn(row, "data_json");
  const runId = textColumn(row, "run_id");
  const stepId = textColumn(row, "step_id");
  const scope = textColumn(row, "scope");
  return {
    token,
    subject,
    form,
    status,
    issuedAt,
    expiresAt,
    submittedAt,
    ...(remindedAt === undefined || remindedAt === null ? {} : { remindedAt }),
    ...(escalatedAt === undefined || escalatedAt === null ? {} : { escalatedAt }),
    ...(expiredAt === undefined || expiredAt === null ? {} : { expiredAt }),
    data: dataJson === undefined ? undefined : JSON.parse(dataJson),
    ...(runId === undefined ? {} : { runId }),
    ...(stepId === undefined ? {} : { stepId }),
    ...(scope === undefined ? {} : { scope }),
  };
}

function decodeCollectionTick(
  row: unknown,
): DurableObjectSqliteCollectionTick | undefined {
  const id = textColumn(row, "id");
  const token = textColumn(row, "collection_token");
  const phase = collectionTickPhase(textColumn(row, "phase"));
  const fireAt = numberColumn(row, "fire_at");
  const status = collectionTickStatus(textColumn(row, "status"));
  const scheduledAt = numberColumn(row, "scheduled_at");
  const firedAt = numberColumn(row, "fired_at");
  const reason = textColumn(row, "reason");
  if (
    id === undefined ||
    token === undefined ||
    phase === undefined ||
    fireAt === undefined ||
    fireAt === null ||
    status === undefined ||
    scheduledAt === undefined ||
    scheduledAt === null ||
    firedAt === undefined
  ) {
    return undefined;
  }
  return {
    id,
    token,
    phase,
    fireAt,
    status,
    scheduledAt,
    firedAt,
    ...(reason === undefined ? {} : { reason }),
  };
}

function decodeFlowWaitTick(
  row: unknown,
): DurableObjectSqliteFlowWaitTick | undefined {
  const id = textColumn(row, "id");
  const runId = textColumn(row, "run_id");
  const stepId = textColumn(row, "step_id");
  const eventId = textColumn(row, "event_id");
  const fireAt = numberColumn(row, "fire_at");
  const status = flowWaitTickStatus(textColumn(row, "status"));
  const scheduledAt = numberColumn(row, "scheduled_at");
  const firedAt = numberColumn(row, "fired_at");
  const reason = textColumn(row, "reason");
  if (
    id === undefined ||
    runId === undefined ||
    stepId === undefined ||
    eventId === undefined ||
    fireAt === undefined ||
    fireAt === null ||
    status === undefined ||
    scheduledAt === undefined ||
    scheduledAt === null ||
    firedAt === undefined
  ) {
    return undefined;
  }
  return {
    id,
    runId,
    stepId,
    eventId,
    fireAt,
    status,
    scheduledAt,
    firedAt,
    ...(reason === undefined ? {} : { reason }),
  };
}

type DurableObjectSqliteDagRunRow = Omit<
  DurableObjectSqliteDagRun,
  "events"
>;

function decodeDagRunRow(row: unknown): DurableObjectSqliteDagRunRow | undefined {
  const runId = textColumn(row, "run_id");
  const flowDefName = textColumn(row, "flow_def_name");
  const subject = textColumn(row, "subject");
  const status = dagRunStatus(textColumn(row, "status"));
  const currentStepId = textColumn(row, "current_step_id");
  const startedAt = numberColumn(row, "started_at");
  const updatedAt = numberColumn(row, "updated_at");
  const completedAt = numberColumn(row, "completed_at");
  if (
    runId === undefined ||
    flowDefName === undefined ||
    subject === undefined ||
    status === undefined ||
    startedAt === undefined ||
    startedAt === null ||
    updatedAt === undefined ||
    updatedAt === null ||
    completedAt === undefined
  ) {
    return undefined;
  }
  const contextJson = textColumn(row, "context_json");
  return {
    runId,
    flowDefName,
    subject,
    status,
    ...(currentStepId === undefined ? {} : { currentStepId }),
    startedAt,
    updatedAt,
    ...(completedAt === null ? {} : { completedAt }),
    ...(contextJson === undefined ? {} : { context: JSON.parse(contextJson) }),
  };
}

function decodeDagEvent(row: unknown): DurableObjectSqliteDagEvent | undefined {
  const eventId = textColumn(row, "event_id");
  const runId = textColumn(row, "run_id");
  const ts = numberColumn(row, "ts");
  const stepId = textColumn(row, "step_id");
  const type = textColumn(row, "type");
  const kind = textColumn(row, "kind");
  const message = textColumn(row, "message");
  if (
    eventId === undefined ||
    runId === undefined ||
    ts === undefined ||
    ts === null ||
    stepId === undefined ||
    type === undefined ||
    kind === undefined
  ) {
    return undefined;
  }
  return {
    eventId,
    runId,
    ts,
    stepId,
    type,
    kind,
    ...(message === undefined ? {} : { message }),
  };
}

function eventJson(event: Event): string {
  return JSON.stringify(event);
}

function projectionRowJson(row: ProjectionRow): string {
  return JSON.stringify(row);
}

function collectionDataJson(data: unknown): string | null {
  return data === undefined ? null : JSON.stringify(data);
}

function dagContextJson(context: unknown): string | null {
  return context === undefined ? null : JSON.stringify(context);
}

function clockKey(replicaId: string): string {
  return `clock:${replicaId}`;
}

function seqKey(replicaId: string): string {
  return `seq:${replicaId}`;
}

function isHlc(value: unknown, replicaId: string): value is Hlc {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Hlc).pt === "number" &&
    typeof (value as Hlc).l === "number" &&
    (value as Hlc).r === replicaId
  );
}

function isSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export class DurableObjectSqliteEventStore implements EventStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.events} (` +
        "id TEXT PRIMARY KEY NOT NULL, " +
        "e TEXT, " +
        "a TEXT, " +
        "target TEXT, " +
        "event_json TEXT NOT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.eventsByEntity} ` +
        `ON ${this.plan.tables.events} (e)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.eventsByAttribute} ` +
        `ON ${this.plan.tables.events} (a)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.eventsByTarget} ` +
        `ON ${this.plan.tables.events} (target)`,
    );
  }

  async append(event: Event): Promise<AppendResult> {
    if (!verifyId(event)) throw new Error(`invalid event id: ${event.id}`);
    const existing = await this.get(event.id);
    const inserted = existing === undefined;
    if (inserted) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.events} (id, e, a, target, event_json) VALUES (?, ?, ?, ?, ?)`,
        event.id,
        event.e ?? null,
        event.a ?? null,
        event.target ?? null,
        eventJson(event),
      );
    } else if (existing.seq === undefined && event.seq !== undefined) {
      this.sql.exec(
        `UPDATE ${this.plan.tables.events} SET event_json = ? WHERE id = ?`,
        eventJson(event),
        event.id,
      );
    }
    return { event, inserted };
  }

  async get(id: EventId): Promise<Event | undefined> {
    return decodeEvent(
      rows(
        this.sql.exec(
          `SELECT event_json FROM ${this.plan.tables.events} WHERE id = ?`,
          id,
        ),
      )[0],
    );
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    if (filter.ids) {
      const out: Event[] = [];
      for (const id of new Set(filter.ids)) {
        const event = await this.get(id);
        if (!event) continue;
        if (filter.e !== undefined && event.e !== filter.e) continue;
        if (filter.a !== undefined && event.a !== filter.a) continue;
        if (filter.target !== undefined && event.target !== filter.target) continue;
        out.push(event);
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    }

    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.e !== undefined) {
      clauses.push("e = ?");
      bindings.push(filter.e);
    }
    if (filter.a !== undefined) {
      clauses.push("a = ?");
      bindings.push(filter.a);
    }
    if (filter.target !== undefined) {
      clauses.push("target = ?");
      bindings.push(filter.target);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    return rows(
      this.sql.exec(
        `SELECT event_json FROM ${this.plan.tables.events}${where} ORDER BY id`,
        ...bindings,
      ),
    )
      .map(decodeEvent)
      .filter((event): event is Event => event !== undefined);
  }

  async merge(events: Iterable<Event>): Promise<MergeResult> {
    let inserted = 0;
    let seen = 0;
    for (const event of events) {
      seen++;
      if ((await this.append(event)).inserted) inserted++;
    }
    return { inserted, seen };
  }
}

export class DurableObjectSqliteProjectionStore implements ProjectionStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.projection} (` +
        "id TEXT PRIMARY KEY NOT NULL, " +
        "e TEXT NOT NULL, " +
        "a TEXT NOT NULL, " +
        "event_id TEXT NOT NULL, " +
        "row_json TEXT NOT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.projectionByEntity} ` +
        `ON ${this.plan.tables.projection} (e)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.projectionByAttribute} ` +
        `ON ${this.plan.tables.projection} (a)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.projectionByEventId} ` +
        `ON ${this.plan.tables.projection} (event_id)`,
    );
  }

  async replace(rowsIn: Iterable<ProjectionRow>): Promise<ProjectionReplaceResult> {
    await this.clear();
    let count = 0;
    for (const row of rowsIn) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.projection} (id, e, a, event_id, row_json) VALUES (?, ?, ?, ?, ?)`,
        row.id,
        row.e,
        row.a,
        row.eventId,
        projectionRowJson(row),
      );
      count += 1;
    }
    return { rows: count };
  }

  async replaceMatching(
    filter: ProjectionFilter,
    rowsIn: Iterable<ProjectionRow>,
  ): Promise<ProjectionReplaceResult> {
    if (
      filter.e === undefined &&
      filter.a === undefined &&
      filter.ids === undefined &&
      filter.eventIds === undefined
    ) {
      await this.clear();
    } else if (
      filter.e !== undefined &&
      filter.a !== undefined &&
      filter.ids === undefined &&
      filter.eventIds === undefined
    ) {
      this.sql.exec(
        `DELETE FROM ${this.plan.tables.projection} WHERE e = ? AND a = ?`,
        filter.e,
        filter.a,
      );
    } else {
      const matching = await this.scan(filter);
      for (const row of matching) {
        this.sql.exec(
          `DELETE FROM ${this.plan.tables.projection} WHERE id = ?`,
          row.id,
        );
      }
    }

    let count = 0;
    for (const row of rowsIn) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.projection} (id, e, a, event_id, row_json) VALUES (?, ?, ?, ?, ?)`,
        row.id,
        row.e,
        row.a,
        row.eventId,
        projectionRowJson(row),
      );
      count += 1;
    }
    return { rows: count };
  }

  async clear(): Promise<void> {
    this.sql.exec(`DELETE FROM ${this.plan.tables.projection}`);
  }

  async scan(filter: ProjectionFilter = {}): Promise<ProjectionRow[]> {
    if (filter.ids) {
      const out: ProjectionRow[] = [];
      for (const id of new Set(filter.ids)) {
        const row = decodeProjectionRow(
          rows(
            this.sql.exec(
              `SELECT row_json FROM ${this.plan.tables.projection} WHERE id = ?`,
              id,
            ),
          )[0],
        );
        if (!row) continue;
        if (filter.e !== undefined && row.e !== filter.e) continue;
        if (filter.a !== undefined && row.a !== filter.a) continue;
        if (filter.eventIds !== undefined && !filter.eventIds.includes(row.eventId)) {
          continue;
        }
        out.push(row);
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    }

    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.e !== undefined) {
      clauses.push("e = ?");
      bindings.push(filter.e);
    }
    if (filter.a !== undefined) {
      clauses.push("a = ?");
      bindings.push(filter.a);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const eventIds = filter.eventIds ? new Set(filter.eventIds) : null;
    return rows(
      this.sql.exec(
        `SELECT row_json FROM ${this.plan.tables.projection}${where} ORDER BY id`,
        ...bindings,
      ),
    )
      .map(decodeProjectionRow)
      .filter(
        (row): row is ProjectionRow =>
          row !== undefined && (eventIds === null || eventIds.has(row.eventId)),
      );
  }
}

export class DurableObjectSqliteCollectionStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.collections} (` +
        "token TEXT PRIMARY KEY NOT NULL, " +
        "subject TEXT NOT NULL, " +
        "form TEXT NOT NULL, " +
        "status TEXT NOT NULL CHECK (status IN ('issued', 'submitted', 'expired')), " +
        "issued_at REAL NOT NULL, " +
        "expires_at REAL NULL, " +
        "submitted_at REAL NULL, " +
        "reminded_at REAL NULL, " +
        "escalated_at REAL NULL, " +
        "expired_at REAL NULL, " +
        "data_json TEXT NULL, " +
        "run_id TEXT NULL, " +
        "step_id TEXT NULL, " +
        "scope TEXT NULL" +
        ")",
    );
    addColumnIfMissing(this.sql, this.plan.tables.collections, "reminded_at REAL NULL");
    addColumnIfMissing(this.sql, this.plan.tables.collections, "escalated_at REAL NULL");
    addColumnIfMissing(this.sql, this.plan.tables.collections, "expired_at REAL NULL");
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.collectionsBySubject} ` +
        `ON ${this.plan.tables.collections} (subject)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.collectionsByStatus} ` +
        `ON ${this.plan.tables.collections} (status)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.collectionsByExpiresAt} ` +
        `ON ${this.plan.tables.collections} (expires_at)`,
    );
  }

  async issue(
    input: DurableObjectSqliteIssueCollectionInput,
  ): Promise<DurableObjectSqliteCollection> {
    const existing = await this.get(input.token);
    if (existing !== undefined) {
      throw new Error(`collection token already exists: ${input.token}`);
    }
    this.sql.exec(
      `INSERT INTO ${this.plan.tables.collections} (` +
        "token, subject, form, status, issued_at, expires_at, submitted_at, " +
        "reminded_at, escalated_at, expired_at, data_json, run_id, step_id, scope" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      input.token,
      input.subject,
      input.form,
      "issued",
      input.issuedAt,
      input.expiresAt ?? null,
      null,
      null,
      null,
      null,
      null,
      input.runId ?? null,
      input.stepId ?? null,
      input.scope ?? null,
    );
    const row = await this.get(input.token);
    if (row === undefined) {
      throw new Error(`failed to issue collection token: ${input.token}`);
    }
    return row;
  }

  async get(token: string): Promise<DurableObjectSqliteCollection | undefined> {
    return decodeCollection(
      rows(
        this.sql.exec(
          `SELECT token, subject, form, status, issued_at, expires_at, submitted_at, data_json, run_id, step_id, scope ` +
            `, reminded_at, escalated_at, expired_at ` +
            `FROM ${this.plan.tables.collections} WHERE token = ?`,
          token,
        ),
      )[0],
    );
  }

  async list(
    filter: DurableObjectSqliteCollectionFilter = {},
  ): Promise<DurableObjectSqliteCollection[]> {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.subject !== undefined) {
      clauses.push("subject = ?");
      bindings.push(filter.subject);
    }
    if (filter.status !== undefined) {
      clauses.push("status = ?");
      bindings.push(filter.status);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rowsOut = rows(
      this.sql.exec(
        `SELECT token, subject, form, status, issued_at, expires_at, submitted_at, data_json, run_id, step_id, scope ` +
          `, reminded_at, escalated_at, expired_at ` +
          `FROM ${this.plan.tables.collections}${where} ORDER BY issued_at, token`,
        ...bindings,
      ),
    )
      .map(decodeCollection)
      .filter((row): row is DurableObjectSqliteCollection => row !== undefined);
    return rowsOut.slice(0, Math.max(1, Math.min(filter.limit ?? 100, 1000)));
  }

  async submit(
    input: DurableObjectSqliteSubmitCollectionInput,
  ): Promise<DurableObjectSqliteCollection> {
    const existing = await this.get(input.token);
    if (existing === undefined) {
      throw new Error(`unknown collection token: ${input.token}`);
    }
    if (existing.status === "submitted") {
      throw new Error(`collection token already submitted: ${input.token}`);
    }
    if (
      existing.status === "expired" ||
      (existing.expiresAt !== null && input.submittedAt >= existing.expiresAt)
    ) {
      await this.expire(input.token, input.submittedAt);
      throw new Error(`collection token expired: ${input.token}`);
    }
    this.sql.exec(
      `UPDATE ${this.plan.tables.collections} ` +
        "SET status = ?, submitted_at = ?, data_json = ? WHERE token = ?",
      "submitted",
      input.submittedAt,
      collectionDataJson(input.data),
      input.token,
    );
    const row = await this.get(input.token);
    if (row === undefined) {
      throw new Error(`failed to submit collection token: ${input.token}`);
    }
    return row;
  }

  async remind(
    token: string,
    remindedAt: number,
  ): Promise<DurableObjectSqliteCollection | undefined> {
    this.sql.exec(
      `UPDATE ${this.plan.tables.collections} SET reminded_at = ? WHERE token = ?`,
      remindedAt,
      token,
    );
    return this.get(token);
  }

  async escalate(
    token: string,
    escalatedAt: number,
  ): Promise<DurableObjectSqliteCollection | undefined> {
    this.sql.exec(
      `UPDATE ${this.plan.tables.collections} SET escalated_at = ? WHERE token = ?`,
      escalatedAt,
      token,
    );
    return this.get(token);
  }

  async expire(
    token: string,
    expiredAt: number,
  ): Promise<DurableObjectSqliteCollection | undefined> {
    this.sql.exec(
      `UPDATE ${this.plan.tables.collections} ` +
        "SET status = ?, expired_at = ? WHERE token = ?",
      "expired",
      expiredAt,
      token,
    );
    return this.get(token);
  }
}

export class DurableObjectSqliteTimerStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.timers} (` +
        "id TEXT PRIMARY KEY NOT NULL, " +
        "collection_token TEXT NOT NULL, " +
        "phase TEXT NOT NULL CHECK (phase IN ('reminder', 'escalation', 'expire')), " +
        "fire_at REAL NOT NULL, " +
        "status TEXT NOT NULL CHECK (status IN ('pending', 'fired', 'skipped')), " +
        "scheduled_at REAL NOT NULL, " +
        "fired_at REAL NULL, " +
        "reason TEXT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.timersByToken} ` +
        `ON ${this.plan.tables.timers} (collection_token)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.timersByStatusFireAt} ` +
        `ON ${this.plan.tables.timers} (status, fire_at)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.timersByPhase} ` +
        `ON ${this.plan.tables.timers} (phase)`,
    );
  }

  async schedule(
    input: DurableObjectSqliteScheduleCollectionTickInput,
  ): Promise<DurableObjectSqliteCollectionTick> {
    const existing = await this.get(input.id);
    if (existing !== undefined) {
      throw new Error(`collection tick already exists: ${input.id}`);
    }
    this.sql.exec(
      `INSERT INTO ${this.plan.tables.timers} (` +
        "id, collection_token, phase, fire_at, status, scheduled_at, fired_at, reason" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      input.id,
      input.token,
      input.phase,
      input.fireAt,
      "pending",
      input.scheduledAt,
      null,
      null,
    );
    const row = await this.get(input.id);
    if (row === undefined) {
      throw new Error(`failed to schedule collection tick: ${input.id}`);
    }
    return row;
  }

  async get(id: string): Promise<DurableObjectSqliteCollectionTick | undefined> {
    return decodeCollectionTick(
      rows(
        this.sql.exec(
          `SELECT id, collection_token, phase, fire_at, status, scheduled_at, fired_at, reason ` +
            `FROM ${this.plan.tables.timers} WHERE id = ?`,
          id,
        ),
      )[0],
    );
  }

  async list(
    filter: DurableObjectSqliteCollectionTickFilter = {},
  ): Promise<DurableObjectSqliteCollectionTick[]> {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.token !== undefined) {
      clauses.push("collection_token = ?");
      bindings.push(filter.token);
    }
    if (filter.phase !== undefined) {
      clauses.push("phase = ?");
      bindings.push(filter.phase);
    }
    if (filter.status !== undefined) {
      clauses.push("status = ?");
      bindings.push(filter.status);
    }
    if (filter.dueAt !== undefined) {
      clauses.push("fire_at <= ?");
      bindings.push(filter.dueAt);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rowsOut = rows(
      this.sql.exec(
        `SELECT id, collection_token, phase, fire_at, status, scheduled_at, fired_at, reason ` +
          `FROM ${this.plan.tables.timers}${where} ORDER BY fire_at, id`,
        ...bindings,
      ),
    )
      .map(decodeCollectionTick)
      .filter((row): row is DurableObjectSqliteCollectionTick => row !== undefined);
    return rowsOut.slice(0, Math.max(1, Math.min(filter.limit ?? 100, 1000)));
  }

  async mark(
    id: string,
    status: DurableObjectSqliteCollectionTickStatus,
    firedAt: number,
    reason?: string,
  ): Promise<DurableObjectSqliteCollectionTick> {
    this.sql.exec(
      `UPDATE ${this.plan.tables.timers} ` +
        "SET status = ?, fired_at = ?, reason = ? WHERE id = ?",
      status,
      firedAt,
      reason ?? null,
      id,
    );
    const row = await this.get(id);
    if (row === undefined) {
      throw new Error(`failed to update collection tick: ${id}`);
    }
    return row;
  }
}

export class DurableObjectSqliteFlowWaitTimerStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.flowWaitTimers} (` +
        "id TEXT PRIMARY KEY NOT NULL, " +
        "run_id TEXT NOT NULL, " +
        "step_id TEXT NOT NULL, " +
        "event_id TEXT NOT NULL, " +
        "fire_at REAL NOT NULL, " +
        "status TEXT NOT NULL CHECK (status IN ('pending', 'fired', 'skipped')), " +
        "scheduled_at REAL NOT NULL, " +
        "fired_at REAL NULL, " +
        "reason TEXT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.flowWaitTimersByRun} ` +
        `ON ${this.plan.tables.flowWaitTimers} (run_id)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.flowWaitTimersByStatusFireAt} ` +
        `ON ${this.plan.tables.flowWaitTimers} (status, fire_at)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.flowWaitTimersByStep} ` +
        `ON ${this.plan.tables.flowWaitTimers} (run_id, step_id)`,
    );
  }

  async schedule(
    input: DurableObjectSqliteScheduleFlowWaitTickInput,
  ): Promise<DurableObjectSqliteFlowWaitTick> {
    const existing = await this.get(input.id);
    if (existing !== undefined) {
      throw new Error(`flow wait tick already exists: ${input.id}`);
    }
    this.sql.exec(
      `INSERT INTO ${this.plan.tables.flowWaitTimers} (` +
        "id, run_id, step_id, event_id, fire_at, status, scheduled_at, fired_at, reason" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      input.id,
      input.runId,
      input.stepId,
      input.eventId,
      input.fireAt,
      "pending",
      input.scheduledAt,
      null,
      null,
    );
    const row = await this.get(input.id);
    if (row === undefined) {
      throw new Error(`failed to schedule flow wait tick: ${input.id}`);
    }
    return row;
  }

  async get(id: string): Promise<DurableObjectSqliteFlowWaitTick | undefined> {
    return decodeFlowWaitTick(
      rows(
        this.sql.exec(
          `SELECT id, run_id, step_id, event_id, fire_at, status, scheduled_at, fired_at, reason ` +
            `FROM ${this.plan.tables.flowWaitTimers} WHERE id = ?`,
          id,
        ),
      )[0],
    );
  }

  async list(
    filter: DurableObjectSqliteFlowWaitTickFilter = {},
  ): Promise<DurableObjectSqliteFlowWaitTick[]> {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.runId !== undefined) {
      clauses.push("run_id = ?");
      bindings.push(filter.runId);
    }
    if (filter.stepId !== undefined) {
      clauses.push("step_id = ?");
      bindings.push(filter.stepId);
    }
    if (filter.status !== undefined) {
      clauses.push("status = ?");
      bindings.push(filter.status);
    }
    if (filter.dueAt !== undefined) {
      clauses.push("fire_at <= ?");
      bindings.push(filter.dueAt);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rowsOut = rows(
      this.sql.exec(
        `SELECT id, run_id, step_id, event_id, fire_at, status, scheduled_at, fired_at, reason ` +
          `FROM ${this.plan.tables.flowWaitTimers}${where} ORDER BY fire_at, id`,
        ...bindings,
      ),
    )
      .map(decodeFlowWaitTick)
      .filter((row): row is DurableObjectSqliteFlowWaitTick => row !== undefined);
    return rowsOut.slice(0, Math.max(1, Math.min(filter.limit ?? 100, 1000)));
  }

  async mark(
    id: string,
    status: DurableObjectSqliteFlowWaitTickStatus,
    firedAt: number,
    reason?: string,
  ): Promise<DurableObjectSqliteFlowWaitTick> {
    this.sql.exec(
      `UPDATE ${this.plan.tables.flowWaitTimers} ` +
        "SET status = ?, fired_at = ?, reason = ? WHERE id = ?",
      status,
      firedAt,
      reason ?? null,
      id,
    );
    const row = await this.get(id);
    if (row === undefined) {
      throw new Error(`failed to update flow wait tick: ${id}`);
    }
    return row;
  }
}

export class DurableObjectSqliteDagStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.flowDagRuns} (` +
        "run_id TEXT PRIMARY KEY NOT NULL, " +
        "flow_def_name TEXT NOT NULL, " +
        "subject TEXT NOT NULL, " +
        "status TEXT NOT NULL CHECK (status IN ('running', 'waiting', 'completed', 'unsupported')), " +
        "current_step_id TEXT NULL, " +
        "started_at REAL NOT NULL, " +
        "updated_at REAL NOT NULL, " +
        "completed_at REAL NULL, " +
        "context_json TEXT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.flowDagEvents} (` +
        "event_id TEXT PRIMARY KEY NOT NULL, " +
        "run_id TEXT NOT NULL, " +
        "ts REAL NOT NULL, " +
        "step_id TEXT NOT NULL, " +
        "type TEXT NOT NULL, " +
        "kind TEXT NOT NULL, " +
        "message TEXT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.dagRunsBySubject} ` +
        `ON ${this.plan.tables.flowDagRuns} (subject)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.dagRunsBySubjectFlowStatus} ` +
        `ON ${this.plan.tables.flowDagRuns} (subject, flow_def_name, status)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.dagRunsByStatus} ` +
        `ON ${this.plan.tables.flowDagRuns} (status)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.dagRunsByUpdatedAt} ` +
        `ON ${this.plan.tables.flowDagRuns} (updated_at)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.dagEventsByRun} ` +
        `ON ${this.plan.tables.flowDagEvents} (run_id)`,
    );
  }

  async record(
    input: DurableObjectSqliteRecordDagRunInput,
  ): Promise<DurableObjectSqliteDagRun> {
    const existing = input.runId === undefined
      ? await this.findActive(input.subject, input.flowDefName)
      : await this.getRow(input.runId);
    const runId = existing?.runId ?? input.runId;
    if (runId === undefined) {
      throw new Error(
        `runId required to create DAG run for ${input.subject}/${input.flowDefName}`,
      );
    }

    const completedAt = input.status === "completed" ||
      input.status === "unsupported"
      ? input.now
      : null;

    if (existing === undefined) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.flowDagRuns} (` +
          "run_id, flow_def_name, subject, status, current_step_id, started_at, " +
          "updated_at, completed_at, context_json" +
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        runId,
        input.flowDefName,
        input.subject,
        input.status,
        input.currentStepId ?? null,
        input.now,
        input.now,
        completedAt,
        dagContextJson(input.context),
      );
    } else {
      this.sql.exec(
        `UPDATE ${this.plan.tables.flowDagRuns} ` +
          "SET status = ?, current_step_id = ?, updated_at = ?, completed_at = ?, context_json = ? " +
          "WHERE run_id = ?",
        input.status,
        input.currentStepId ?? null,
        input.now,
        completedAt,
        dagContextJson(input.context),
        runId,
      );
    }

    for (const event of input.events) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.flowDagEvents} (` +
          "event_id, run_id, ts, step_id, type, kind, message" +
          ") VALUES (?, ?, ?, ?, ?, ?, ?)",
        event.eventId,
        runId,
        input.now,
        event.stepId,
        event.type,
        event.kind,
        event.message ?? null,
      );
    }

    const run = await this.get(runId);
    if (run === undefined) {
      throw new Error(`failed to record DAG run: ${runId}`);
    }
    return run;
  }

  async get(runId: string): Promise<DurableObjectSqliteDagRun | undefined> {
    const row = await this.getRow(runId);
    if (row === undefined) return undefined;
    const events = await this.listEvents(runId);
    return { ...row, events };
  }

  async list(
    filter: DurableObjectSqliteDagRunFilter = {},
  ): Promise<DurableObjectSqliteDagRun[]> {
    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.subject !== undefined) {
      clauses.push("subject = ?");
      bindings.push(filter.subject);
    }
    if (filter.status !== undefined) {
      clauses.push("status = ?");
      bindings.push(filter.status);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rowsOut = rows(
      this.sql.exec(
        `SELECT run_id, flow_def_name, subject, status, current_step_id, started_at, updated_at, completed_at, context_json ` +
          `FROM ${this.plan.tables.flowDagRuns}${where} ORDER BY updated_at DESC, run_id DESC`,
        ...bindings,
      ),
    )
      .map(decodeDagRunRow)
      .filter((row): row is DurableObjectSqliteDagRunRow => row !== undefined)
      .slice(0, Math.max(1, Math.min(filter.limit ?? 20, 100)));
    const out: DurableObjectSqliteDagRun[] = [];
    for (const row of rowsOut) {
      out.push({ ...row, events: await this.listEvents(row.runId) });
    }
    return out;
  }

  private async getRow(
    runId: string,
  ): Promise<DurableObjectSqliteDagRunRow | undefined> {
    return decodeDagRunRow(
      rows(
        this.sql.exec(
          `SELECT run_id, flow_def_name, subject, status, current_step_id, started_at, updated_at, completed_at, context_json ` +
            `FROM ${this.plan.tables.flowDagRuns} WHERE run_id = ?`,
          runId,
        ),
      )[0],
    );
  }

  private async findActive(
    subject: string,
    flowDefName: string,
  ): Promise<DurableObjectSqliteDagRunRow | undefined> {
    return decodeDagRunRow(
      rows(
        this.sql.exec(
          `SELECT run_id, flow_def_name, subject, status, current_step_id, started_at, updated_at, completed_at, context_json ` +
            `FROM ${this.plan.tables.flowDagRuns} ` +
            "WHERE subject = ? AND flow_def_name = ? AND status IN ('waiting', 'running') " +
            "ORDER BY updated_at DESC, run_id DESC",
          subject,
          flowDefName,
        ),
      )[0],
    );
  }

  private async listEvents(
    runId: string,
  ): Promise<DurableObjectSqliteDagEvent[]> {
    return rows(
      this.sql.exec(
        `SELECT event_id, run_id, ts, step_id, type, kind, message ` +
          `FROM ${this.plan.tables.flowDagEvents} WHERE run_id = ? ORDER BY ts, event_id`,
        runId,
      ),
    )
      .map(decodeDagEvent)
      .filter((event): event is DurableObjectSqliteDagEvent => event !== undefined);
  }
}

class DurableObjectSqliteMetaStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.meta} (` +
        "key TEXT PRIMARY KEY NOT NULL, " +
        "value TEXT NOT NULL" +
        ")",
    );
  }

  async get(key: string): Promise<string | undefined> {
    return valueColumn(
      rows(
        this.sql.exec(
          `SELECT value FROM ${this.plan.tables.meta} WHERE key = ?`,
          key,
        ),
      )[0],
      "value",
    );
  }

  async set(key: string, value: string): Promise<void> {
    this.sql.exec(
      `INSERT INTO ${this.plan.tables.meta} (key, value) VALUES (?, ?) ` +
        "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }
}

export class DurableObjectSqliteClock implements RuntimeClock {
  private constructor(
    private readonly meta: DurableObjectSqliteMetaStore,
    readonly replicaId: string,
    private readonly wall: () => number,
    private clock: Hlc,
  ) {}

  static async create(
    meta: DurableObjectSqliteMetaStore,
    replicaId: string,
    wall: () => number = () => Date.now(),
  ): Promise<DurableObjectSqliteClock> {
    const raw = await meta.get(clockKey(replicaId));
    const parsed = raw === undefined ? undefined : (JSON.parse(raw) as unknown);
    return new DurableObjectSqliteClock(
      meta,
      replicaId,
      wall,
      isHlc(parsed, replicaId) ? parsed : initialClock(replicaId),
    );
  }

  current(): Hlc {
    return this.clock;
  }

  async tick(): Promise<Hlc> {
    this.clock = tick(this.clock, this.wall(), this.replicaId);
    await this.meta.set(clockKey(this.replicaId), JSON.stringify(this.clock));
    return this.clock;
  }

  async receive(remote: Hlc): Promise<Hlc> {
    this.clock = receive(this.clock, remote, this.wall(), this.replicaId);
    await this.meta.set(clockKey(this.replicaId), JSON.stringify(this.clock));
    return this.clock;
  }
}

export class DurableObjectSqliteSequencer implements RuntimeSequencer {
  private constructor(
    private readonly meta: DurableObjectSqliteMetaStore,
    readonly replicaId: string,
    private seq: number,
  ) {}

  static async create(
    meta: DurableObjectSqliteMetaStore,
    replicaId: string,
  ): Promise<DurableObjectSqliteSequencer> {
    const raw = await meta.get(seqKey(replicaId));
    const parsed = raw === undefined ? 0 : Number(raw);
    return new DurableObjectSqliteSequencer(
      meta,
      replicaId,
      isSeq(parsed) ? Math.floor(parsed) : 0,
    );
  }

  async next(): Promise<number> {
    this.seq += 1;
    await this.meta.set(seqKey(this.replicaId), String(this.seq));
    return this.seq;
  }

  current(): number {
    return this.seq;
  }
}

export async function createDurableObjectSqliteRuntime(
  options: DurableObjectSqliteRuntimeOptions,
): Promise<DurableObjectSqliteRuntime> {
  const tablePrefix = options.tablePrefix ?? "metacrdt";
  const store = new DurableObjectSqliteEventStore(options.sql, tablePrefix);
  const projection = new DurableObjectSqliteProjectionStore(options.sql, tablePrefix);
  const collections = new DurableObjectSqliteCollectionStore(
    options.sql,
    tablePrefix,
  );
  const timers = new DurableObjectSqliteTimerStore(options.sql, tablePrefix);
  const flowWaitTimers = new DurableObjectSqliteFlowWaitTimerStore(
    options.sql,
    tablePrefix,
  );
  const dag = new DurableObjectSqliteDagStore(options.sql, tablePrefix);
  const meta = new DurableObjectSqliteMetaStore(options.sql, tablePrefix);
  if (options.initialize ?? true) {
    await store.initialize();
    await projection.initialize();
    await collections.initialize();
    await timers.initialize();
    await flowWaitTimers.initialize();
    await dag.initialize();
    await meta.initialize();
  }
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? [
      "convergent-log",
      "coordinated-writes",
      "projection-store",
    ],
  );
  const profile: RuntimeProfile = {
    name: options.name ?? "cloudflare-durable-object-sqlite",
    replicaId: options.replicaId,
    capabilities,
  };
  return {
    profile,
    store,
    projection,
    collections,
    timers,
    flowWaitTimers,
    dag,
    clock: await DurableObjectSqliteClock.create(
      meta,
      options.replicaId,
      options.wall,
    ),
    sequencer: await DurableObjectSqliteSequencer.create(meta, options.replicaId),
  };
}

function durableObjectSqliteRuntimeInitError(cause: unknown): RuntimeServiceError {
  return new RuntimeServiceError({
    service: "DurableObjectSqliteRuntime",
    operation: "createDurableObjectSqliteRuntime",
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export function createDurableObjectSqliteRuntimeLayer(
  options: DurableObjectSqliteRuntimeOptions,
): Layer.Layer<ProjectionRuntimeServices, RuntimeServiceError> {
  return Layer.unwrapEffect(
    Effect.map(
      Effect.tryPromise({
        try: () => createDurableObjectSqliteRuntime(options),
        catch: durableObjectSqliteRuntimeInitError,
      }),
      (runtime) =>
        runtimeServicesLayer({
          profile: runtime.profile,
          store: runtime.store,
          projection: runtime.projection,
          clock: runtime.clock,
          sequencer: runtime.sequencer,
          scheduler: runtime.scheduler,
          transport: runtime.transport,
        }),
    ),
  );
}
