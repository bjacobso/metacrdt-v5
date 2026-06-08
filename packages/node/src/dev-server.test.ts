import { get } from "node:http";
import { describe, expect, test } from "vitest";
import {
  parseNodeDevServerArgs,
  startNodeDevServer,
} from "./dev-server.js";

type HttpGetResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function httpGet(url: string): Promise<HttpGetResult> {
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      res.setEncoding("utf8");
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
        });
      });
    });
    req.on("error", reject);
  });
}

describe("metacrdt-node-dev", () => {
  test("parses CLI options", () => {
    const parsed = parseNodeDevServerArgs([
      "--host",
      "0.0.0.0",
      "--port",
      "0",
      "--base-path",
      "sync",
      "--replica-id",
      "node:test",
      "--name",
      "local-test",
    ]);

    expect(parsed.help).toBe(false);
    expect(parsed.options).toMatchObject({
      host: "0.0.0.0",
      port: 0,
      basePath: "/sync",
      replicaId: "node:test",
      name: "local-test",
    });
  });

  test("parses help and rejects bad ports", () => {
    expect(parseNodeDevServerArgs(["--help"]).help).toBe(true);
    expect(() => parseNodeDevServerArgs(["--port", "nope"])).toThrow(
      "invalid --port",
    );
  });

  test("starts an in-memory HTTP sync server", async () => {
    const started = await startNodeDevServer({
      port: 0,
      host: "127.0.0.1",
      basePath: "/sync",
      replicaId: "node:dev-test",
      wall: () => 7_000,
    });

    try {
      expect(started.port).toBeGreaterThan(0);
      expect(started.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(started.syncUrl).toBe(`${started.origin}/sync`);

      const health = await httpGet(`${started.syncUrl}/health`);
      expect(health.status).toBe(200);
      expect(health.headers["content-type"]).toBe("application/json");
      expect(JSON.parse(health.body)).toMatchObject({
        ok: true,
        protocol: "metacrdt.node.http.v1",
        profile: { replicaId: "node:dev-test" },
      });
    } finally {
      await started.close();
    }
  });
});
