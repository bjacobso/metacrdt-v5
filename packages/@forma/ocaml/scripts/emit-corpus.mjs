import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { packageDir, readExampleSources, readPreludes } from "./corpus.mjs";
import { requireNativeCli } from "./require-build.mjs";

const nativeCli = requireNativeCli();
const strict = process.argv.includes("--strict");
const daemonResponseTimeoutMs = Number(process.env.OO_LANG_DAEMON_TIMEOUT_MS ?? 30000);

const mergeCounts = (target, source) => {
  for (const [key, count] of source) {
    target.set(key, (target.get(key) ?? 0) + count);
  }
};

const declarationKindCounts = (declarations) => {
  const counts = new Map();
  for (const declaration of Array.isArray(declarations) ? declarations : []) {
    const kind = declaration?.kind;
    if (typeof kind === "string") counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
};

const formatCounts = (counts) =>
  [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");

const preludes = readPreludes();
const sources = readExampleSources({ canonicalOnly: true, dropOntologyManifest: true });

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
let loaded = 0;
let emitted = 0;
let declarationCount = 0;
const failures = [];
const emittedKindCounts = new Map();
const emittedResultTypeCounts = new Map();

try {
  const opened = await request({ op: "openSession" });
  if (opened?.ok !== true) throw new Error(`openSession failed: ${JSON.stringify(opened)}`);
  sessionId = opened.value.sessionId;

  const loadedSourceIds = [];
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));

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

    if (result?.ok !== true) {
      failures.push({
        phase: "loadSource",
        sourceId: result?.sourceId ?? "unknown",
        summary: diagnosticsSummary(result),
      });
      continue;
    }
    loaded += 1;
    loadedSourceIds.push(result.sourceId);
  }

  if (loadedSourceIds.length > 0) {
    const emitManyResponse = await request({
      op: "emitMany",
      sessionId,
      sourceIds: loadedSourceIds,
    });

    if (emitManyResponse?.ok !== true) {
      throw new Error(`emitMany failed: ${JSON.stringify(emitManyResponse)}`);
    }

    for (const result of emitManyResponse.value?.results ?? []) {
      const source = sourceById.get(result.sourceId);
      if (result?.ok !== true) {
        failures.push({
          phase: result?.phase ?? "emit",
          sourceId: result?.sourceId ?? "unknown",
          summary: diagnosticsSummary(result),
        });
        continue;
      }

      const content = result.artifact?.content;
      if (
        source == null ||
        content?.hashAlgorithm !== "md5" ||
        content?.sourceHashes?.[source.sourceId] == null ||
        content?.preludeHashes?.["preludes/ontology-compiler.lisp"] == null ||
        typeof content?.declarationsHash !== "string" ||
        !Array.isArray(content?.declarationProvenance) ||
        !Array.isArray(content?.declarationTypeSummaries) ||
        !Array.isArray(content?.derivedArtifacts?.[0]?.declarations) ||
        content.declarationProvenance.length !== content?.declarations?.length ||
        content.declarationTypeSummaries.length !== content?.declarations?.length ||
        content?.typeSummary?.declarationCount !== content?.declarationCount ||
        content.declarationTypeSummaries.some(
          (summary) => summary == null || typeof summary?.resultType !== "string",
        ) ||
        content.derivedArtifacts[0].declarations.length !== content?.declarations?.length ||
        content.derivedArtifacts[0].declarations.some(
          (summary) => summary?.kind === "Unknown" || typeof summary?.resultType !== "string",
        ) ||
        content.declarationProvenance.some(
          (item, index) =>
            item?.declarationIndex !== index ||
            item?.sourceId !== source.sourceId ||
            typeof item?.formIndex !== "number" ||
            typeof item?.span?.startOffset !== "number" ||
            typeof item?.span?.endOffset !== "number" ||
            typeof item?.span?.startLine !== "number" ||
            typeof item?.span?.startColumn !== "number" ||
            typeof item?.span?.endLine !== "number" ||
            typeof item?.span?.endColumn !== "number" ||
            item.span.endOffset <= item.span.startOffset,
        ) ||
        content?.declarationCount !== content?.declarations?.length
      ) {
        failures.push({
          phase: "validateArtifact",
          sourceId: result.sourceId,
          summary: "missing or inconsistent canonical IR provenance fields",
        });
        continue;
      }

      emitted += 1;
      declarationCount += content.declarationCount;
      mergeCounts(emittedKindCounts, declarationKindCounts(content.declarations));
      mergeCounts(
        emittedResultTypeCounts,
        declarationKindCounts(
          (content?.declarationTypeSummaries ?? []).map((summary) => ({
            kind: summary?.resultType,
          })),
        ),
      );
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
  console.error(`language-ocaml corpus emit failed: ${hardFailure.message}`);
  process.exit(1);
}

console.log(
  `language-ocaml corpus emit report: loaded ${loaded}/${sources.length}, emitted ${emitted}/${sources.length}, declarations ${declarationCount}`,
);
console.log(`emitted kinds: ${formatCounts(emittedKindCounts)}`);
console.log(`emitted result types: ${formatCounts(emittedResultTypeCounts)}`);

if (failures.length > 0) {
  console.log(`emit gaps: ${failures.length}/${sources.length}`);
  for (const failure of failures.slice(0, 20)) {
    console.log(`${failure.phase} ${failure.sourceId}: ${failure.summary}`);
  }
}

if (strict && failures.length > 0) {
  process.exit(1);
}
