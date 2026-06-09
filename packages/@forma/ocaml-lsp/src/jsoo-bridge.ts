import { createRequire } from "node:module";
import { createInterface } from "node:readline";

const artifactPath = process.argv[2];
if (!artifactPath) {
  throw new Error("jsoo-bridge requires the path to dist/js/jsoo_entry.cjs");
}

const require = createRequire(import.meta.url);
process.argv = process.argv.slice(0, 2);
require(artifactPath);

const globalWithJsoo = globalThis as typeof globalThis & {
  jsoo_runtime?: {
    caml_callback?: (fn: unknown, args: readonly unknown[]) => unknown;
    caml_get_global_data?: () => {
      Language_ocaml__Abi?: readonly unknown[];
    };
  };
};

const runtime = globalWithJsoo.jsoo_runtime;
const abi = runtime?.caml_get_global_data?.().Language_ocaml__Abi;
const handleJson = abi?.[3];
if (typeof handleJson !== "function" || typeof runtime?.caml_callback !== "function") {
  throw new Error(`Could not locate Language_ocaml__Abi.handle_json in ${artifactPath}`);
}
const camlCallback = runtime.caml_callback;

process.stdout.write(`${JSON.stringify({ bridge: "ready" })}\n`);

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  const response = camlCallback(handleJson, [trimmed]);
  process.stdout.write(`${response}\n`);
});
