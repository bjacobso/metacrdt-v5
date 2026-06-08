#!/usr/bin/env node
import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import {
  createNodeHttpRequestListener,
  createNodeMemoryRuntime,
  type NodeSyncHttpOptions,
} from "./index.js";
import type { RuntimeServices } from "@metacrdt/runtime";

export type NodeDevServerOptions = NodeSyncHttpOptions & {
  name?: string;
  replicaId?: string;
  host?: string;
  port?: number;
  wall?: () => number;
  log?: (message: string) => void;
};

export type StartedNodeDevServer = {
  runtime: RuntimeServices;
  server: Server;
  host: string;
  port: number;
  basePath: string;
  replicaId: string;
  origin: string;
  syncUrl: string;
  close(): Promise<void>;
};

export type ParsedNodeDevServerArgs = {
  options: NodeDevServerOptions;
  help: boolean;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_BASE_PATH = "/metacrdt";

function normalizeBasePath(path = DEFAULT_BASE_PATH): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.length > 1 && withSlash.endsWith("/")
    ? withSlash.slice(0, -1)
    : withSlash;
}

function displayHost(host: string): string {
  return host === "0.0.0.0" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host;
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`invalid --port: ${raw}`);
  }
  return port;
}

function nextValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function usage(): string {
  return [
    "Usage: metacrdt-node-dev [options]",
    "",
    "Starts an in-memory MetaCRDT Node sync server for local development.",
    "",
    "Options:",
    "  --host <host>           Host to bind (default: 127.0.0.1)",
    "  --port <port>           Port to bind; 0 asks the OS to choose (default: 8787)",
    "  --base-path <path>      Sync route base path (default: /metacrdt)",
    "  --replica-id <id>       Replica id (default: node:dev)",
    "  --name <name>           Runtime profile name (default: node-dev)",
    "  --help                  Show this help",
  ].join("\n");
}

export function parseNodeDevServerArgs(
  args: readonly string[],
): ParsedNodeDevServerArgs {
  const options: NodeDevServerOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      return { options, help: true };
    }
    if (arg === "--host") {
      options.host = nextValue(args, i, arg);
      i++;
      continue;
    }
    if (arg === "--port") {
      options.port = parsePort(nextValue(args, i, arg));
      i++;
      continue;
    }
    if (arg === "--base-path") {
      options.basePath = normalizeBasePath(nextValue(args, i, arg));
      i++;
      continue;
    }
    if (arg === "--replica-id") {
      options.replicaId = nextValue(args, i, arg);
      i++;
      continue;
    }
    if (arg === "--name") {
      options.name = nextValue(args, i, arg);
      i++;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return { options, help: false };
}

export async function startNodeDevServer(
  options: NodeDevServerOptions = {},
): Promise<StartedNodeDevServer> {
  const host = options.host ?? DEFAULT_HOST;
  const requestedPort = options.port ?? DEFAULT_PORT;
  const basePath = normalizeBasePath(options.basePath);
  const replicaId = options.replicaId ?? "node:dev";
  const runtime = createNodeMemoryRuntime({
    name: options.name ?? "node-dev",
    replicaId,
    wall: options.wall,
  });
  const listener = createNodeHttpRequestListener(runtime, {
    basePath,
    protocol: options.protocol,
  });
  const server = createServer((req, res) => {
    void listener(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: message }));
      } else {
        res.destroy(err instanceof Error ? err : new Error(message));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, host);
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : requestedPort;
  const origin = `http://${displayHost(host)}:${port}`;
  const syncUrl = `${origin}${basePath}`;

  options.log?.(`MetaCRDT Node dev server listening at ${syncUrl}`);
  options.log?.(`Replica: ${replicaId}`);

  return {
    runtime,
    server,
    host,
    port,
    basePath,
    replicaId,
    origin,
    syncUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseNodeDevServerArgs(args);
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const started = await startNodeDevServer({ ...parsed.options, log: console.log });
  const shutdown = async () => {
    await started.close();
  };
  process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
