import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { packageDir, readExampleSources, readPreludes } from "./corpus.mjs";
import { corpusGolden } from "./gates.mjs";
import { requireNativeCli } from "./require-build.mjs";

const nativeCli = requireNativeCli();
const printActual = process.argv.includes("--print");
const daemonResponseTimeoutMs = Number(process.env.OO_LANG_DAEMON_TIMEOUT_MS ?? 30000);

const stableJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const increment = (counts, key, amount = 1) => {
  counts.set(key, (counts.get(key) ?? 0) + amount);
};

const objectFromCounts = (counts) =>
  Object.fromEntries([...counts.entries()].sort((left, right) => left[0].localeCompare(right[0])));

const declarationKindCounts = (declarations) => {
  const counts = new Map();
  for (const declaration of Array.isArray(declarations) ? declarations : []) {
    const kind = declaration?.kind;
    if (typeof kind === "string") increment(counts, kind);
  }
  return counts;
};

const summaryMetadataPaths = (value, path = "$") => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => summaryMetadataPaths(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === "$summary") paths.push(childPath);
    paths.push(...summaryMetadataPaths(child, childPath));
  }
  return paths;
};

const diagnosticsSummary = (response) => {
  const first = response?.diagnostics?.[0];
  if (!first) return "unknown failure";
  return `${first.code ?? "unknown"}: ${first.message ?? ""}`.trim();
};

const expectOk = (label, response) => {
  if (response?.ok !== true) {
    throw new Error(
      `${label} failed: ${diagnosticsSummary(response)}\n${JSON.stringify(response)}`,
    );
  }
};

const preludes = readPreludes({ kind: "prelude" });
const sources = readExampleSources({
  kind: "source",
  canonicalOnly: true,
  dropOntologyManifest: true,
});

if (sources.length === 0) {
  throw new Error("No Lisp example sources found.");
}

const daemon = spawn(nativeCli, ["daemon"], {
  cwd: packageDir,
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
daemon.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const responses = [];
const waiters = [];
const lines = createInterface({ input: daemon.stdout });

lines.on("line", (line) => {
  responses.push(line);
  const waiter = waiters.shift();
  if (waiter) waiter();
});

const waitForLine = async () => {
  if (responses.length > 0) return responses.shift();
  return new Promise((resolveLine, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for daemon response. stderr: ${stderr}`));
    }, daemonResponseTimeoutMs);
    waiters.push(() => {
      clearTimeout(timeout);
      resolveLine(responses.shift());
    });
  });
};

const request = async (payload) => {
  daemon.stdin.write(`${JSON.stringify(payload)}\n`);
  const line = await waitForLine();
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Could not parse daemon response ${JSON.stringify(line)}: ${error}`);
  }
};

let sessionId;

try {
  const opened = await request({ op: "openSession" });
  expectOk("openSession", opened);
  sessionId = opened.value.sessionId;

  const loaded = await request({
    op: "loadSourceBundle",
    sessionId,
    sources: [...preludes, ...sources],
  });
  expectOk("loadSourceBundle", loaded);

  const loadFailures = (loaded.value?.results ?? []).filter((result) => result?.ok !== true);
  if (loadFailures.length > 0) {
    throw new Error(`Corpus load failures:\n${JSON.stringify(loadFailures, null, 2)}`);
  }

  const sourceIds = sources.map((source) => source.sourceId);
  const emitted = await request({ op: "emitMany", sessionId, sourceIds });
  expectOk("emitMany", emitted);
  const results = emitted.value?.results;
  if (!Array.isArray(results) || results.length !== sourceIds.length) {
    throw new Error(`emitMany returned ${results?.length ?? 0}/${sourceIds.length} results.`);
  }

  const perSource = [];
  const corpusKindCounts = new Map();
  let declarationCount = 0;

  for (const result of results) {
    if (result?.ok !== true) {
      throw new Error(
        `Corpus emit failure for ${result?.sourceId ?? "unknown"}: ${diagnosticsSummary(result)}`,
      );
    }

    const content = result.artifact?.content;
    if (
      content?.irVersion !== "1" ||
      content?.hashAlgorithm !== "md5" ||
      typeof content?.declarationsHash !== "string" ||
      typeof content?.declarationCount !== "number" ||
      !Array.isArray(content?.declarations)
    ) {
      throw new Error(
        `Unexpected canonical IR artifact for ${result.sourceId}:\n${JSON.stringify(result, null, 2)}`,
      );
    }

    const kindCounts = declarationKindCounts(content.declarations);
    for (const [kind, count] of kindCounts) increment(corpusKindCounts, kind, count);

    const leakedSummaryPaths = summaryMetadataPaths(content);
    if (leakedSummaryPaths.length > 0) {
      throw new Error(
        `Canonical IR artifact for ${result.sourceId} leaked declaration summary metadata: ${leakedSummaryPaths.join(", ")}`,
      );
    }

    declarationCount += content.declarationCount;
    perSource.push({
      sourceId: result.sourceId,
      declarationCount: content.declarationCount,
      declarationsHash: content.declarationsHash,
      kindCounts: objectFromCounts(kindCounts),
    });
  }

  perSource.sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  const actual = {
    sourceCount: sources.length,
    emittedCount: emitted.value?.emittedCount,
    declarationCount,
    kindCounts: objectFromCounts(corpusKindCounts),
    manifestHash: sha256(stableJson(perSource)),
  };

  if (printActual) {
    console.log(JSON.stringify(actual, null, 2));
  } else if (stableJson(actual) !== stableJson(corpusGolden)) {
    throw new Error(
      `Corpus golden mismatch.\nExpected:\n${JSON.stringify(corpusGolden, null, 2)}\nActual:\n${JSON.stringify(actual, null, 2)}`,
    );
  } else {
    console.log(
      `language-ocaml corpus golden ok (${actual.sourceCount} sources, ${actual.declarationCount} declarations)`,
    );
  }
} finally {
  if (sessionId) {
    try {
      await request({ op: "closeSession", sessionId });
    } catch {
      // The daemon may already be closing after an earlier hard failure.
    }
  }
  daemon.stdin.end();
}

const exitCode = await new Promise((resolveExit) => daemon.on("close", resolveExit));
if (exitCode !== 0) {
  throw new Error(`Daemon exited with ${exitCode}: ${stderr}`);
}
