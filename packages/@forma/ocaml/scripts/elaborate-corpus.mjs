import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { packageDir, readExampleSources, readPreludes } from "./corpus.mjs";

const nativeCli = resolve(packageDir, "dist/native/oo_lang_cli.exe");
const strict = process.argv.includes("--strict");
const daemonResponseTimeoutMs = Number(process.env.OO_LANG_DAEMON_TIMEOUT_MS ?? 30000);

const mergeCounts = (target, source) => {
  for (const [key, count] of source) {
    target.set(key, (target.get(key) ?? 0) + count);
  }
};

const countElaboratedKinds = (value) => {
  const counts = new Map();
  for (const item of Array.isArray(value) ? value : []) {
    if (item?.kind !== "map") continue;
    const kind = item.entries?.find((entry) => entry.key?.value === ":kind")?.value?.value;
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
};

const preludes = readPreludes();
const sources = readExampleSources({
  canonicalOnly: true,
  includeForms: true,
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

const diagnosticsSummary = (response) => {
  const first = response?.diagnostics?.[0];
  if (!first) return "unknown failure";
  return `${first.code ?? "unknown"}: ${first.message ?? ""}`.trim();
};

let sessionId;
let hardFailure;
const failures = [];
const loadedFormCounts = new Map();
const failedFormCounts = new Map();
const elaboratedKindCounts = new Map();
let loaded = 0;
let elaborated = 0;

try {
  const opened = await request({ op: "openSession" });
  if (opened?.ok !== true) throw new Error(`openSession failed: ${JSON.stringify(opened)}`);
  sessionId = opened.value.sessionId;

  const loadedSourceIds = [];
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));

  for (const source of sources) {
    mergeCounts(loadedFormCounts, source.forms);
  }

  const loadBundleResponse = await request({
    op: "loadSourceBundle",
    sessionId,
    sources: [
      ...preludes.map((prelude) => ({ kind: "prelude", ...prelude })),
      ...sources.map((source) => ({ kind: "source", ...source })),
    ],
  });

  if (loadBundleResponse?.ok !== true) {
    throw new Error(`loadSourceBundle failed: ${JSON.stringify(loadBundleResponse)}`);
  }

  for (const result of loadBundleResponse.value?.results ?? []) {
    if (result.kind === "prelude") {
      if (result?.ok !== true) {
        throw new Error(`loadPrelude ${result.sourceId} failed: ${JSON.stringify(result)}`);
      }
      continue;
    }

    const source = sourceById.get(result.sourceId);
    if (result?.ok !== true) {
      if (source) mergeCounts(failedFormCounts, source.forms);
      failures.push({
        phase: "loadSource",
        sourceId: result?.sourceId ?? "unknown",
        summary: diagnosticsSummary(result),
        response: result,
      });
      continue;
    }
    loaded += 1;
    loadedSourceIds.push(result.sourceId);
  }

  if (loadedSourceIds.length > 0) {
    const elaborateManyResponse = await request({
      op: "elaborateMany",
      sessionId,
      sourceIds: loadedSourceIds,
    });

    if (elaborateManyResponse?.ok !== true) {
      throw new Error(`elaborateMany failed: ${JSON.stringify(elaborateManyResponse)}`);
    }

    for (const result of elaborateManyResponse.value?.results ?? []) {
      const source = sourceById.get(result.sourceId);
      if (result?.ok !== true) {
        if (source) mergeCounts(failedFormCounts, source.forms);
        failures.push({
          phase: result?.phase ?? "elaborate",
          sourceId: result?.sourceId ?? "unknown",
          summary: diagnosticsSummary(result),
          response: result,
        });
        continue;
      }

      elaborated += 1;
      mergeCounts(elaboratedKindCounts, countElaboratedKinds(result.value));
    }
  }
} catch (error) {
  hardFailure = error;
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

if (hardFailure) {
  console.error(`language-ocaml corpus elaboration failed: ${hardFailure.message}`);
  process.exit(1);
}

const formatCounts = (counts) =>
  [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");

console.log(
  `language-ocaml corpus elaborate report: loaded ${loaded}/${sources.length}, elaborated ${elaborated}/${sources.length}`,
);
console.log(`forms seen: ${formatCounts(loadedFormCounts)}`);
console.log(`elaborated kinds: ${formatCounts(elaboratedKindCounts)}`);

if (failures.length > 0) {
  console.log(`elaboration gaps: ${failures.length}/${sources.length}`);
  console.log(`forms in failing sources: ${formatCounts(failedFormCounts)}`);
  for (const failure of failures.slice(0, 20)) {
    console.log(`${failure.phase} ${failure.sourceId}: ${failure.summary}`);
  }
}

if (strict && failures.length > 0) {
  process.exit(1);
}
