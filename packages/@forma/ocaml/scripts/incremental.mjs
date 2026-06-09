import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { packageDir } from "./corpus.mjs";

const nativeCli = resolve(packageDir, "dist/native/oo_lang_cli.exe");

const request = (payload) => {
  const result = spawnSync(nativeCli, ["request", JSON.stringify(payload)], {
    cwd: packageDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`request failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
};

const beforeSource = `
(define a 1)
(define b 2)
(define c 3)
`;

const afterSource = `
(define a 1)
(define b 20)
(define c 3)
`;

const before = request({
  op: "incrementalSummary",
  sourceId: "incremental/before.lisp",
  source: beforeSource,
});
const after = request({
  op: "incrementalSummary",
  sourceId: "incremental/after.lisp",
  source: afterSource,
});

if (
  before?.ok !== true ||
  after?.ok !== true ||
  before.value?.formCount !== 3 ||
  after.value?.formCount !== 3 ||
  before.value.forms[0]?.digest !== after.value.forms[0]?.digest ||
  before.value.forms[1]?.digest === after.value.forms[1]?.digest ||
  before.value.forms[2]?.digest !== after.value.forms[2]?.digest
) {
  throw new Error(
    `Unexpected incremental summaries:\nbefore ${JSON.stringify(
      before,
      null,
      2,
    )}\nafter ${JSON.stringify(after, null, 2)}`,
  );
}

console.log("language-ocaml incremental ok (top-level form reuse digests)");
