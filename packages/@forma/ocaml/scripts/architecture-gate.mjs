import { spawnSync } from "node:child_process";
import { architectureThresholds } from "./gates.mjs";

const cwd = new URL("..", import.meta.url);
const thresholds = architectureThresholds;

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.error?.code === "ENOENT") {
    console.error(`Missing required command: ${command}`);
    process.exit(127);
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.stdout.write(result.stdout ?? "");
    process.exit(result.status ?? 1);
  }

  return result.stdout;
};

const output = run("node", ["scripts/bench.mjs"]);
const summary = JSON.parse(output);
const failures = [];

const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(summary.native?.bytes > 0, "native target is missing or empty");
expect(
  typeof summary.native?.startupMs === "number" && summary.native.startupMs > 0,
  "native startup measurement is missing",
);
expect(
  summary.native?.startupMs <= thresholds.maxNativeStartupMs,
  `native startup ${summary.native?.startupMs}ms exceeds ${thresholds.maxNativeStartupMs}ms`,
);
expect(summary.js?.bytes > 0, "js target is missing or empty");
expect(
  typeof summary.js?.startupMs === "number" && summary.js.startupMs > 0,
  "js startup measurement is missing",
);
expect(
  summary.js?.startupMs <= thresholds.maxJsStartupMs,
  `js startup ${summary.js?.startupMs}ms exceeds ${thresholds.maxJsStartupMs}ms`,
);
expect(
  summary.js?.gzipBytes <= thresholds.maxJsGzipBytes,
  `js gzip size ${summary.js?.gzipBytes} exceeds ${thresholds.maxJsGzipBytes}`,
);
expect(summary.wasm?.wasmBytes > 0, "wasm target is missing or empty");
expect(
  typeof summary.wasm?.startupMs === "number" && summary.wasm.startupMs > 0,
  "wasm startup measurement is missing",
);
expect(
  summary.wasm?.startupMs <= thresholds.maxWasmStartupMs,
  `wasm startup ${summary.wasm?.startupMs}ms exceeds ${thresholds.maxWasmStartupMs}ms`,
);
expect(
  summary.wasm?.brotliBytes <= thresholds.maxWasmBrotliBytes,
  `wasm brotli size ${summary.wasm?.brotliBytes} exceeds ${thresholds.maxWasmBrotliBytes}`,
);
expect(
  summary.wasm?.gzipBytes <= thresholds.maxWasmGzipBytes,
  `wasm gzip size ${summary.wasm?.gzipBytes} exceeds ${thresholds.maxWasmGzipBytes}`,
);
expect(
  summary.corpus?.sourceCount === thresholds.expectedSourceCount,
  `corpus source count ${summary.corpus?.sourceCount} does not match ${thresholds.expectedSourceCount}`,
);
expect(
  summary.corpus?.declarationCount === thresholds.expectedDeclarationCount,
  `corpus declaration count ${summary.corpus?.declarationCount} does not match ${thresholds.expectedDeclarationCount}`,
);
expect(
  summary.corpus?.diagnosticCount === thresholds.maxDiagnosticCount,
  `corpus diagnostic count ${summary.corpus?.diagnosticCount} does not match ${thresholds.maxDiagnosticCount}`,
);
expect(
  summary.corpus?.loadedCount === summary.corpus?.preludeCount + thresholds.expectedSourceCount,
  `loaded count ${summary.corpus?.loadedCount} does not match preludes + sources`,
);
expect(
  summary.corpus?.loadAndSummarizeMs <= thresholds.maxCorpusLoadAndSummarizeMs,
  `corpus load+summary ${summary.corpus?.loadAndSummarizeMs}ms exceeds ${thresholds.maxCorpusLoadAndSummarizeMs}ms`,
);
for (const metric of ["openMs", "preludeLoadMs", "sourceLoadMs", "firstSummarizeMs"]) {
  expect(
    typeof summary.corpus?.[metric] === "number" && summary.corpus[metric] > 0,
    `corpus phase metric ${metric} is missing`,
  );
}
for (const metric of [
  "parseMs",
  "evalMs",
  "typecheckMs",
  "elaborateMs",
  "elaborateExpandMs",
  "elaborateCollectMs",
  "elaborateApplyHookMs",
  "elaborateSummaryExpectationMs",
  "elaboratePayloadContractMs",
  "elaborateSummaryValidationMs",
  "typedDeclMs",
]) {
  expect(
    typeof summary.corpus?.sourceLoadPhaseTimings?.[metric] === "number",
    `source load phase timing ${metric} is missing`,
  );
}
expect(
  summary.corpus?.cacheHitCount === thresholds.expectedSourceCount &&
    summary.corpus?.cacheMissCount === 0,
  `warm artifact summary cache hits ${summary.corpus?.cacheHitCount}/${thresholds.expectedSourceCount}, misses ${summary.corpus?.cacheMissCount}`,
);
expect(
  summary.corpus?.firstSummaryCacheHitCount === thresholds.expectedSourceCount &&
    summary.corpus?.firstSummaryCacheMissCount === 0,
  `first artifact summary cache hits ${summary.corpus?.firstSummaryCacheHitCount}/${thresholds.expectedSourceCount}, misses ${summary.corpus?.firstSummaryCacheMissCount}`,
);
expect(
  summary.corpus?.warmEmitCacheHitCount === thresholds.expectedSourceCount &&
    summary.corpus?.warmEmitCacheMissCount === 0,
  `warm emit cache hits ${summary.corpus?.warmEmitCacheHitCount}/${thresholds.expectedSourceCount}, misses ${summary.corpus?.warmEmitCacheMissCount}`,
);
expect(
  typeof summary.corpus?.warmEmitManyMs === "number" && summary.corpus.warmEmitManyMs > 0,
  "warm emitMany measurement is missing",
);
expect(
  typeof summary.corpus?.editLoadAndEmitManyMs === "number" &&
    summary.corpus.editLoadAndEmitManyMs > 0,
  "edit load+emitMany measurement is missing",
);
expect(
  typeof summary.corpus?.editLoadMs === "number" && summary.corpus.editLoadMs > 0,
  "edit loadSource measurement is missing",
);
expect(
  typeof summary.corpus?.editSummarizeAfterLoadMs === "number" &&
    summary.corpus.editSummarizeAfterLoadMs > 0,
  "edit summarize-after-load measurement is missing",
);
expect(
  typeof summary.corpus?.editEmitLoadMs === "number" && summary.corpus.editEmitLoadMs > 0,
  "edit emit loadSource measurement is missing",
);
expect(
  typeof summary.corpus?.editEmitManyAfterLoadMs === "number" &&
    summary.corpus.editEmitManyAfterLoadMs > 0,
  "edit emitMany-after-load measurement is missing",
);
// Locks eager loadSource artifact-cache warming; see docs/move-e.md.
expect(
  summary.corpus?.editSourceSummaryCacheHit === true &&
    summary.corpus?.editSourceEmitCacheHit === true,
  `edited source cache telemetry expected hits after eager loadSource warming, got summary=${summary.corpus?.editSourceSummaryCacheHit}, emit=${summary.corpus?.editSourceEmitCacheHit}`,
);
expect(
  typeof summary.evalLatency?.native?.avgMs === "number" &&
    summary.evalLatency.native.avgMs <= thresholds.maxNativeEvalLatencyAvgMs,
  `native eval latency avg ${summary.evalLatency?.native?.avgMs}ms exceeds ${thresholds.maxNativeEvalLatencyAvgMs}ms`,
);
expect(
  typeof summary.evalLatency?.js?.avgMs === "number" &&
    summary.evalLatency.js.avgMs <= thresholds.maxJsEvalLatencyAvgMs,
  `js eval latency avg ${summary.evalLatency?.js?.avgMs}ms exceeds ${thresholds.maxJsEvalLatencyAvgMs}ms`,
);
expect(
  typeof summary.evalLatency?.wasm?.avgMs === "number" &&
    summary.evalLatency.wasm.avgMs <= thresholds.maxWasmEvalLatencyAvgMs,
  `wasm eval latency avg ${summary.evalLatency?.wasm?.avgMs}ms exceeds ${thresholds.maxWasmEvalLatencyAvgMs}ms`,
);

const gate = {
  ok: failures.length === 0,
  thresholds,
  summary,
  failures,
};

console.log(JSON.stringify(gate, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
