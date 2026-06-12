import {
  base32,
  canonicalString,
  compareEvents,
  fromEvents,
  merge,
  sha256,
  utf8,
  value,
  type CardinalityOf,
  type Coord,
  type Event,
  type Log,
  type Value,
} from "@metacrdt/core";
import {
  applyOperation,
  createMemoryRuntime,
  exchangeDeltas,
  type RuntimeServices,
  type SyncExchangeResult,
} from "@metacrdt/runtime";

export const ATTRIBUTES = [
  "worker/name",
  "worker/status",
  "worker/role",
] as const;

export type WorkerAttribute = (typeof ATTRIBUTES)[number];
export type ReplicaName = "alfa" | "bravo";

export type DemoRuntime = RuntimeServices & {
  store: RuntimeServices["store"];
  clock: RuntimeServices["clock"];
  sequencer: NonNullable<RuntimeServices["sequencer"]>;
};

export type ProjectionCell = {
  value: Value;
  eventId: string;
  hlc: Event["hlc"];
  actor: string;
};

export type WorkerProjection = {
  id: string;
  attributes: Partial<Record<WorkerAttribute, ProjectionCell>>;
};

export type ConflictExplanation = {
  winner?: Event;
  loser?: Event;
  candidates: Event[];
  reason: string;
};

export type ReplicaSnapshot = {
  replica: ReplicaName;
  events: Event[];
  orderedEvents: Event[];
  coord: Coord;
  workers: WorkerProjection[];
  logDigest: string;
  projectionDigest: string;
  conflict: ConflictExplanation;
};

export type PairSnapshot = {
  alfa: ReplicaSnapshot;
  bravo: ReplicaSnapshot;
  converged: boolean;
};

export type ScriptResult = {
  initialSync: SyncExchangeResult;
  offline: PairSnapshot;
  firstReconnect: SyncExchangeResult;
  converged: PairSnapshot;
  secondSync: SyncExchangeResult;
  activeEvent: Event;
  terminatedEvent: Event;
};

export const cardinalityOf: CardinalityOf = () => "one";

export function createDeterministicClock(seed: number): {
  wall: () => number;
  set: (next: number) => void;
  advance: (by?: number) => number;
} {
  let now = seed;
  return {
    wall: () => now,
    set: (next) => {
      now = next;
    },
    advance: (by = 10) => {
      now += by;
      return now;
    },
  };
}

export function createMemoryReplica(
  replicaId: ReplicaName,
  wall: () => number,
): DemoRuntime {
  return createMemoryRuntime({ replicaId, wall }) as DemoRuntime;
}

export async function assertFact(
  runtime: RuntimeServices,
  input: {
    e: string;
    a: WorkerAttribute;
    v: Value;
    actor: string;
    reason?: string;
  },
): Promise<Event> {
  return applyOperation(runtime, {
    op: "assert",
    e: input.e,
    a: input.a,
    v: input.v,
    actor: input.actor,
    reason: input.reason,
  });
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function digestValue(value: Value): string {
  return base32(sha256(utf8(canonicalString(value))));
}

export function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 10)}...${id.slice(-6)}` : id;
}

export function formatHlc(event: Pick<Event, "hlc">): string {
  return `${event.hlc.pt}.${event.hlc.l}@${event.hlc.r}`;
}

export function logDigest(events: readonly Event[]): string {
  const orderedIds = [...events].sort(compareEvents).map((event) => event.id);
  return hex(sha256(utf8(orderedIds.join("\n"))));
}

function eventToCell(event: Event): ProjectionCell {
  return {
    value: event.v ?? null,
    eventId: event.id,
    hlc: event.hlc,
    actor: event.actor,
  };
}

export function projectWorkers(log: Log, coord: Coord): WorkerProjection[] {
  const entityIds = new Set<string>();
  for (const event of log.values()) {
    if (event.kind === "assert" && event.e?.startsWith("worker:")) {
      entityIds.add(event.e);
    }
  }

  return [...entityIds].sort().map((id) => {
    const attributes: Partial<Record<WorkerAttribute, ProjectionCell>> = {};
    for (const attr of ATTRIBUTES) {
      const resolved = value(id, attr, coord, log, cardinalityOf);
      if (resolved && !Array.isArray(resolved)) {
        attributes[attr] = eventToCell(resolved);
      }
    }
    return { id, attributes };
  });
}

export function projectionDigest(workers: readonly WorkerProjection[]): string {
  const canonical = workers.map((worker) => ({
    id: worker.id,
    attributes: Object.fromEntries(
      ATTRIBUTES.flatMap((attr) => {
        const cell = worker.attributes[attr];
        return cell
          ? [
              [
                attr,
                {
                  value: cell.value,
                  eventId: cell.eventId,
                  hlc: [cell.hlc.pt, cell.hlc.l, cell.hlc.r],
                  actor: cell.actor,
                },
              ],
            ]
          : [];
      }),
    ),
  })) as unknown as Value;
  return hex(sha256(utf8(canonicalString(canonical))));
}

export function maxTxTime(events: readonly Event[]): number {
  return events.reduce((max, event) => Math.max(max, event.hlc.pt), 0);
}

export function explainStatusConflict(log: Log, coord: Coord): ConflictExplanation {
  const candidates = [...log.values()]
    .filter(
      (event) =>
        event.kind === "assert" &&
        event.e === "worker:w1" &&
        event.a === "worker/status" &&
        event.hlc.pt <= coord.txTime,
    )
    .sort(compareEvents);
  const winner = candidates[candidates.length - 1];
  const loser = candidates.length > 1 ? candidates[candidates.length - 2] : undefined;
  const reason =
    winner && loser
      ? `winner has the greater protocol order: ${formatHlc(loser)} < ${formatHlc(winner)}`
      : winner
        ? "only one visible status assertion exists"
        : "no status assertion exists yet";
  return { winner, loser, candidates, reason };
}

export async function snapshotReplica(
  replica: ReplicaName,
  runtime: RuntimeServices,
  txTime?: number,
): Promise<ReplicaSnapshot> {
  const events = await runtime.store.scan();
  const orderedEvents = [...events].sort(compareEvents).reverse();
  const coord = {
    txTime: txTime ?? maxTxTime(events),
    validTime: txTime ?? maxTxTime(events),
  };
  const log = fromEvents(events);
  const workers = projectWorkers(log, coord);
  return {
    replica,
    events,
    orderedEvents,
    coord,
    workers,
    logDigest: logDigest(events),
    projectionDigest: projectionDigest(workers),
    conflict: explainStatusConflict(log, coord),
  };
}

export async function snapshotPair(
  alfa: RuntimeServices,
  bravo: RuntimeServices,
): Promise<PairSnapshot> {
  const [a, b] = await Promise.all([
    snapshotReplica("alfa", alfa),
    snapshotReplica("bravo", bravo),
  ]);
  return {
    alfa: a,
    bravo: b,
    converged: a.logDigest === b.logDigest && a.projectionDigest === b.projectionDigest,
  };
}

export function foldDigestOfLog(log: Log): string {
  const eventList = [...log.values()];
  const coord = { txTime: maxTxTime(eventList), validTime: maxTxTime(eventList) };
  return projectionDigest(projectWorkers(log, coord));
}

export async function runHeadlessScript(): Promise<ScriptResult> {
  const alfaClock = createDeterministicClock(1_000);
  const bravoClock = createDeterministicClock(1_000);
  const alfa = createMemoryReplica("alfa", alfaClock.wall);
  const bravo = createMemoryReplica("bravo", bravoClock.wall);

  await assertFact(alfa, {
    e: "worker:w1",
    a: "worker/name",
    v: "Ada",
    actor: "alfa:user",
    reason: "script step 1",
  });
  const initialSync = await exchangeDeltas(alfa, bravo);

  alfaClock.set(2_000);
  const activeEvent = await assertFact(alfa, {
    e: "worker:w1",
    a: "worker/status",
    v: "active",
    actor: "alfa:user",
    reason: "offline alfa status",
  });
  alfaClock.set(2_010);
  await assertFact(alfa, {
    e: "worker:w1",
    a: "worker/role",
    v: "engineer",
    actor: "alfa:user",
    reason: "offline alfa role",
  });

  bravoClock.set(3_000);
  const terminatedEvent = await assertFact(bravo, {
    e: "worker:w1",
    a: "worker/status",
    v: "terminated",
    actor: "bravo:user",
    reason: "offline bravo conflict",
  });
  bravoClock.set(3_010);
  await assertFact(bravo, {
    e: "worker:w2",
    a: "worker/name",
    v: "Grace",
    actor: "bravo:user",
    reason: "offline bravo second worker",
  });

  const offline = await snapshotPair(alfa, bravo);
  const firstReconnect = await exchangeDeltas(alfa, bravo);
  const converged = await snapshotPair(alfa, bravo);
  const secondSync = await exchangeDeltas(alfa, bravo);

  return {
    initialSync,
    offline,
    firstReconnect,
    converged,
    secondSync,
    activeEvent,
    terminatedEvent,
  };
}

export function mergedLogDigest(a: readonly Event[], b: readonly Event[]): string {
  return foldDigestOfLog(merge(fromEvents(a), fromEvents(b)));
}
