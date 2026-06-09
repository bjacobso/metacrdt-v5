import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const cwd = new URL("..", import.meta.url);
const dist = new URL("dist/effect-handler-target-proof/", cwd);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    ...options,
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

const runResult = (command, args, options = {}) =>
  spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    ...options,
  });

const canRun = (command, args) => spawnSync(command, args, { cwd, encoding: "utf8" }).status === 0;

const hasOpamDune = canRun("opam", ["exec", "--", "dune", "--version"]);

const runDune = (args) => {
  if (hasOpamDune) {
    run("opam", ["exec", "--", "dune", ...args]);
    return;
  }

  run("dune", args);
};

const hasTool = (tool) => {
  if (hasOpamDune) {
    return canRun("opam", ["exec", "--", "which", tool]);
  }

  return canRun("which", [tool]);
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(new URL("native/", dist), { recursive: true });

runDune(["build", "test/effect_handler_target_probe.exe"]);
copyFileSync(
  new URL("_build/default/test/effect_handler_target_probe.exe", cwd),
  new URL("native/effect_handler_target_probe.exe", dist),
);

if (hasTool("js_of_ocaml")) {
  mkdirSync(new URL("js/", dist), { recursive: true });
  runDune(["build", "test/effect_handler_target_probe.bc.js"]);
  copyFileSync(
    new URL("_build/default/test/effect_handler_target_probe.bc.js", cwd),
    new URL("js/effect_handler_target_probe.cjs", dist),
  );
}

if (hasTool("wasm_of_ocaml")) {
  mkdirSync(new URL("wasm/", dist), { recursive: true });
  runDune(["build", "test/effect_handler_target_probe.bc.wasm.js"]);
  copyFileSync(
    new URL("_build/default/test/effect_handler_target_probe.bc.wasm.js", cwd),
    new URL("wasm/effect_handler_target_probe.cjs", dist),
  );

  const assets = new URL("_build/default/test/effect_handler_target_probe.bc.wasm.assets/", cwd);
  if (existsSync(assets)) {
    cpSync(assets, new URL("wasm/effect_handler_target_probe.bc.wasm.assets/", dist), {
      recursive: true,
    });
  }
}

const nativeEntry = new URL("native/effect_handler_target_probe.exe", dist).pathname;
const jsEntry = new URL("js/effect_handler_target_probe.cjs", dist).pathname;
const wasmEntry = new URL("wasm/effect_handler_target_probe.cjs", dist).pathname;

const targets = [
  {
    name: "native",
    available: existsSync(nativeEntry),
    request: () => runResult(nativeEntry, []),
  },
  {
    name: "js",
    available: existsSync(jsEntry),
    request: () => runResult("node", [jsEntry]),
  },
  {
    name: "wasm",
    available: existsSync(wasmEntry),
    request: () => runResult("node", [wasmEntry]),
  },
].filter((target) => target.available);

assert.ok(
  targets.some((target) => target.name === "native"),
  "native target missing",
);
assert.ok(
  targets.some((target) => target.name === "js"),
  "js target missing",
);
assert.ok(
  targets.some((target) => target.name === "wasm"),
  "wasm target missing",
);

for (const target of targets) {
  const result = target.request();
  assert.equal(result.status, 0, `${target.name} effect handler probe failed: ${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true, `${target.name} effect handler probe returned not-ok`);
  assert.equal(payload.value, 42, `${target.name} effect handler probe did not resume`);
}

console.log(`language-ocaml effect handler target proof ok (${targets.length} targets)`);
