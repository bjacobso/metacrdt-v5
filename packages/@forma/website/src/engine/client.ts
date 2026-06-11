import {
  timeoutRunResult,
  type EnginePassName,
  type RunResult,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";

const WATCHDOG_MS = 2_000;

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (result: RunResult) => void;
      reject: (error: Error) => void;
      timeout: number;
    }
  >();

  run(source: string, passes: readonly EnginePassName[], sourceId = "demo"): Promise<RunResult> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    const request: WorkerRequest = { id, sourceId, source, passes };

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        this.restart();
        resolve(timeoutRunResult(request, WATCHDOG_MS));
      }, WATCHDOG_MS);
      this.pending.set(id, { resolve, reject, timeout });
      worker.postMessage(request);
    });
  }

  dispose(): void {
    this.restart();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const id = message.kind === "result" ? message.result.id : message.id;
      const pending = this.pending.get(id);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      this.pending.delete(id);
      if (message.kind === "result") {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Compiler worker failed.");
      for (const pending of this.pending.values()) {
        window.clearTimeout(pending.timeout);
        pending.reject(error);
      }
      this.pending.clear();
      this.restart();
    };
    this.worker = worker;
    return worker;
  }

  private restart(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
    }
    this.pending.clear();
  }
}
