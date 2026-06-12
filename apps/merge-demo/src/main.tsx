import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  indexedDbStorage,
  createIndexedDbLocalFirstRuntime,
  localClockKey,
  localEventsKey,
  localSeqKey,
  type IndexedDbLocalFirstRuntime,
} from "@metacrdt/local";
import { exchangeDeltas, type SyncExchangeResult } from "@metacrdt/runtime";
import {
  ATTRIBUTES,
  assertFact,
  createDeterministicClock,
  formatHlc,
  shortId,
  snapshotPair,
  snapshotReplica,
  type PairSnapshot,
  type ReplicaName,
  type ReplicaSnapshot,
  type WorkerAttribute,
} from "./demo.js";
import "./style.css";

const DB_NAME = "metacrdt-merge-demo";
const STORE_NAME = "kv";
const NAMESPACES: Record<ReplicaName, string> = {
  alfa: "merge-demo:alfa",
  bravo: "merge-demo:bravo",
};

type RuntimePair = Record<ReplicaName, IndexedDbLocalFirstRuntime>;
type FormState = {
  entity: string;
  attribute: WorkerAttribute;
  value: string;
};

const DEFAULT_FORMS: Record<ReplicaName, FormState> = {
  alfa: { entity: "worker:w1", attribute: "worker/status", value: "active" },
  bravo: { entity: "worker:w1", attribute: "worker/status", value: "terminated" },
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function clearReplica(replica: ReplicaName): Promise<void> {
  const storage = await indexedDbStorage({ dbName: DB_NAME, storeName: STORE_NAME });
  const ns = NAMESPACES[replica];
  await storage.removeItem?.(localEventsKey(ns));
  await storage.removeItem?.(localClockKey(ns, replica));
  await storage.removeItem?.(localSeqKey(ns, replica));
  await storage.removeItem?.(`${ns}:projection`);
  storage.close();
}

function digestShort(digest: string): string {
  return `${digest.slice(0, 12)} ${digest.slice(-12)}`;
}

function metric(result: SyncExchangeResult | undefined, field: keyof SyncExchangeResult): number {
  const value = result?.[field];
  return typeof value === "number" ? value : 0;
}

function App() {
  const runtimesRef = useRef<RuntimePair | null>(null);
  const clocksRef = useRef({
    alfa: createDeterministicClock(10_000),
    bravo: createDeterministicClock(20_000),
  });
  const [connected, setConnected] = useState(true);
  const [pair, setPair] = useState<PairSnapshot | null>(null);
  const [display, setDisplay] = useState<Record<ReplicaName, ReplicaSnapshot> | null>(null);
  const [lastSync, setLastSync] = useState<SyncExchangeResult>();
  const [forms, setForms] = useState(DEFAULT_FORMS);
  const [historyTx, setHistoryTx] = useState<number | undefined>();
  const [phase, setPhase] = useState("booting");
  const [running, setRunning] = useState(false);
  const [pulse, setPulse] = useState(false);

  async function refresh(nextHistoryTx = historyTx): Promise<void> {
    const runtimes = runtimesRef.current;
    if (!runtimes) return;
    const current = await snapshotPair(runtimes.alfa, runtimes.bravo);
    setPair(current);
    if (nextHistoryTx === undefined) {
      setDisplay({ alfa: current.alfa, bravo: current.bravo });
    } else {
      const [alfa, bravo] = await Promise.all([
        snapshotReplica("alfa", runtimes.alfa, nextHistoryTx),
        snapshotReplica("bravo", runtimes.bravo, nextHistoryTx),
      ]);
      setDisplay({ alfa, bravo });
    }
  }

  async function boot(reset = false): Promise<RuntimePair> {
    setPhase(reset ? "resetting local logs" : "opening local logs");
    if (reset) {
      await Promise.all([clearReplica("alfa"), clearReplica("bravo")]);
      clocksRef.current = {
        alfa: createDeterministicClock(1_000),
        bravo: createDeterministicClock(1_000),
      };
    }
    const [alfaStorage, bravoStorage] = await Promise.all([
      indexedDbStorage({ dbName: DB_NAME, storeName: STORE_NAME }),
      indexedDbStorage({ dbName: DB_NAME, storeName: STORE_NAME }),
    ]);
    const [alfa, bravo] = await Promise.all([
      createIndexedDbLocalFirstRuntime({
        replicaId: "alfa",
        namespace: NAMESPACES.alfa,
        storage: alfaStorage,
        broadcast: false,
        wall: clocksRef.current.alfa.wall,
      }),
      createIndexedDbLocalFirstRuntime({
        replicaId: "bravo",
        namespace: NAMESPACES.bravo,
        storage: bravoStorage,
        broadcast: false,
        wall: clocksRef.current.bravo.wall,
      }),
    ]);
    runtimesRef.current = { alfa, bravo };
    setHistoryTx(undefined);
    setPhase("ready");
    await refresh(undefined);
    return { alfa, bravo };
  }

  useEffect(() => {
    let cancelled = false;
    void boot(false).then(() => {
      if (!cancelled) setPhase("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function syncNow(): Promise<SyncExchangeResult | undefined> {
    const runtimes = runtimesRef.current;
    if (!runtimes) return undefined;
    const result = await exchangeDeltas(runtimes.alfa, runtimes.bravo);
    setLastSync(result);
    setPulse(true);
    setTimeout(() => setPulse(false), 700);
    await refresh();
    return result;
  }

  async function toggleCable(): Promise<void> {
    const next = !connected;
    setConnected(next);
    setPhase(next ? "connected" : "offline");
    if (next) await syncNow();
  }

  async function submitFact(replica: ReplicaName, event?: React.FormEvent) {
    event?.preventDefault();
    const runtimes = runtimesRef.current;
    if (!runtimes) return;
    clocksRef.current[replica].advance(10);
    const form = forms[replica];
    await assertFact(runtimes[replica], {
      e: form.entity,
      a: form.attribute,
      v: form.value,
      actor: `${replica}:user`,
      reason: "manual assertion",
    });
    setPhase(`${replica} asserted ${form.attribute}`);
    if (connected) await syncNow();
    else await refresh();
  }

  async function runScript() {
    setRunning(true);
    setLastSync(undefined);
    const runtimes = await boot(true);
    setConnected(true);
    setPhase("connected: alfa names worker:w1");
    await pause(550);

    clocksRef.current.alfa.set(1_000);
    await assertFact(runtimes.alfa, {
      e: "worker:w1",
      a: "worker/name",
      v: "Ada",
      actor: "alfa:user",
      reason: "script step 1",
    });
    await syncNow();
    await pause(700);

    setConnected(false);
    setPhase("offline branch");
    await refresh();
    await pause(600);

    clocksRef.current.alfa.set(2_000);
    await assertFact(runtimes.alfa, {
      e: "worker:w1",
      a: "worker/status",
      v: "active",
      actor: "alfa:user",
      reason: "offline alfa status",
    });
    await refresh();
    await pause(500);

    clocksRef.current.alfa.set(2_010);
    await assertFact(runtimes.alfa, {
      e: "worker:w1",
      a: "worker/role",
      v: "engineer",
      actor: "alfa:user",
      reason: "offline alfa role",
    });
    await refresh();
    await pause(500);

    clocksRef.current.bravo.set(3_000);
    await assertFact(runtimes.bravo, {
      e: "worker:w1",
      a: "worker/status",
      v: "terminated",
      actor: "bravo:user",
      reason: "offline bravo conflict",
    });
    await refresh();
    await pause(500);

    clocksRef.current.bravo.set(3_010);
    await assertFact(runtimes.bravo, {
      e: "worker:w2",
      a: "worker/name",
      v: "Grace",
      actor: "bravo:user",
      reason: "offline bravo second worker",
    });
    setPhase("offline: divergent logs");
    await refresh();
    await pause(850);

    setConnected(true);
    setPhase("reconnected: exchanging deltas");
    await syncNow();
    await pause(850);

    setPhase("idempotence round");
    await syncNow();
    setPhase("script complete");
    setRunning(false);
  }

  async function viewAsOf(txTime: number | undefined) {
    setHistoryTx(txTime);
    await refresh(txTime);
  }

  const unionEvents = useMemo(() => {
    const seen = new Map<string, { event: ReplicaSnapshot["events"][number]; replica: ReplicaName }>();
    for (const replica of ["alfa", "bravo"] as const) {
      for (const event of pair?.[replica].events ?? []) {
        seen.set(event.id, { event, replica });
      }
    }
    return [...seen.values()].sort((a, b) => a.event.hlc.pt - b.event.hlc.pt);
  }, [pair]);

  if (!pair || !display) {
    return <main className="loading">Opening two local replicas...</main>;
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">MetaCRDT L4 Sync</p>
          <h1>Two-replica branch and merge</h1>
        </div>
        <div className="actions">
          <button onClick={runScript} disabled={running}>
            Run script
          </button>
          <button onClick={() => boot(true)} disabled={running}>
            Reset logs
          </button>
        </div>
      </header>

      <Verifier pair={pair} phase={phase} />

      <section className="workspace-grid">
        <ReplicaPane
          snapshot={display.alfa}
          form={forms.alfa}
          onForm={(form) => setForms((current) => ({ ...current, alfa: form }))}
          onSubmit={(event) => submitFact("alfa", event)}
          onAsOf={viewAsOf}
          historyTx={historyTx}
        />

        <Cable
          connected={connected}
          pulse={pulse}
          result={lastSync}
          onToggle={toggleCable}
          onSync={syncNow}
          disabled={running}
        />

        <ReplicaPane
          snapshot={display.bravo}
          form={forms.bravo}
          onForm={(form) => setForms((current) => ({ ...current, bravo: form }))}
          onSubmit={(event) => submitFact("bravo", event)}
          onAsOf={viewAsOf}
          historyTx={historyTx}
        />
      </section>

      <section className="history-strip">
        <div>
          <p className="eyebrow">Bitemporal coordinate</p>
          <strong>
            {historyTx === undefined ? "current" : `as of txTime ${historyTx}`}
          </strong>
        </div>
        <button onClick={() => viewAsOf(undefined)}>Current</button>
        <div className="history-events">
          {unionEvents.map(({ event, replica }) => (
            <button key={event.id} onClick={() => viewAsOf(event.hlc.pt)}>
              {replica} {event.a ?? event.kind} {formatHlc(event)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function Verifier({ pair, phase }: { pair: PairSnapshot; phase: string }) {
  return (
    <section className={`verifier ${pair.converged ? "ok" : "bad"}`}>
      <div className="verifier-status">
        <p className="eyebrow">Verifier</p>
        <strong>{pair.converged ? "CONVERGED" : "DIVERGED"}</strong>
        <span>{phase}</span>
      </div>
      <DigestBlock label="alfa log" digest={pair.alfa.logDigest} />
      <DigestBlock label="alfa fold" digest={pair.alfa.projectionDigest} />
      <DigestBlock label="bravo log" digest={pair.bravo.logDigest} />
      <DigestBlock label="bravo fold" digest={pair.bravo.projectionDigest} />
    </section>
  );
}

function DigestBlock({ label, digest }: { label: string; digest: string }) {
  return (
    <div className="digest">
      <span>{label}</span>
      <code>{digestShort(digest)}</code>
    </div>
  );
}

function Cable({
  connected,
  pulse,
  result,
  onToggle,
  onSync,
  disabled,
}: {
  connected: boolean;
  pulse: boolean;
  result?: SyncExchangeResult;
  onToggle: () => void;
  onSync: () => void;
  disabled: boolean;
}) {
  return (
    <aside className={`cable ${connected ? "connected" : "offline"} ${pulse ? "pulse" : ""}`}>
      <button className="cable-toggle" onClick={onToggle} disabled={disabled}>
        {connected ? "CONNECTED" : "OFFLINE"}
      </button>
      <div className="wire" />
      <div className="delta-readout">
        <span>alfa to bravo</span>
        <strong>{metric(result, "sentFromA")} events</strong>
        <span>bravo to alfa</span>
        <strong>{metric(result, "sentFromB")} events</strong>
      </div>
      <button onClick={onSync} disabled={disabled || !connected}>
        Sync
      </button>
    </aside>
  );
}

function ReplicaPane({
  snapshot,
  form,
  onForm,
  onSubmit,
  onAsOf,
  historyTx,
}: {
  snapshot: ReplicaSnapshot;
  form: FormState;
  onForm: (form: FormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onAsOf: (txTime: number) => void;
  historyTx?: number;
}) {
  const conflict = snapshot.conflict;
  return (
    <section className="replica-pane">
      <header>
        <div>
          <p className="eyebrow">Replica {snapshot.replica}</p>
          <h2>{historyTx === undefined ? "Current fold" : `Fold at ${historyTx}`}</h2>
        </div>
        <code>{snapshot.events.length} events</code>
      </header>

      <div className="entity-view">
        {snapshot.workers.map((worker) => (
          <div className="worker-row" key={worker.id}>
            <strong>{worker.id}</strong>
            {ATTRIBUTES.map((attr) => (
              <span key={attr}>
                {attr.replace("worker/", "")}:{" "}
                <b>{String(worker.attributes[attr]?.value ?? "-")}</b>
              </span>
            ))}
          </div>
        ))}
        {snapshot.workers.length === 0 ? <p className="empty">No visible facts</p> : null}
      </div>

      <form className="fact-form" onSubmit={onSubmit}>
        <input
          value={form.entity}
          onChange={(event) => onForm({ ...form, entity: event.target.value })}
        />
        <select
          value={form.attribute}
          onChange={(event) =>
            onForm({ ...form, attribute: event.target.value as WorkerAttribute })
          }
        >
          {ATTRIBUTES.map((attr) => (
            <option value={attr} key={attr}>
              {attr}
            </option>
          ))}
        </select>
        <input
          value={form.value}
          onChange={(event) => onForm({ ...form, value: event.target.value })}
        />
        <button>Assert</button>
      </form>

      <div className="conflict-box">
        <p className="eyebrow">worker:w1 status order</p>
        <strong>
          {conflict.winner
            ? `${String(conflict.winner.v)} wins`
            : "no status assertion"}
        </strong>
        <span>{conflict.reason}</span>
        {conflict.loser ? (
          <button onClick={() => onAsOf(conflict.loser!.hlc.pt)}>
            View loser at {formatHlc(conflict.loser)}
          </button>
        ) : null}
      </div>

      <div className="event-log">
        <h3>Event log</h3>
        {snapshot.orderedEvents.map((event) => (
          <button
            className="event-row"
            key={event.id}
            onClick={() => onAsOf(event.hlc.pt)}
          >
            <span>
              <b>{event.a ?? event.kind}</b> {String(event.v ?? "")}
            </span>
            <code>{formatHlc(event)}</code>
            <small>
              seq {event.seq ?? "-"} / {event.actor} / {shortId(event.id)}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
