import { spawnSync } from "node:child_process";

const emitCorpusGolden = new URL("./emit-corpus-golden.mjs", import.meta.url);

const runCorpusGolden = (label, env = {}) => {
  const result = spawnSync(process.execPath, [emitCorpusGolden.pathname], {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  if (result.error?.code === "ENOENT") {
    console.error(`Missing required command: ${process.execPath}`);
    process.exit(127);
  }

  if (result.status !== 0) {
    console.error(`language-ocaml elaboration parity ${label} run failed`);
    process.exit(result.status ?? 1);
  }
};

runCorpusGolden("native");
runCorpusGolden("lisp fallback", {
  OO_LANG_DISABLE_NATIVE_ELABORATION: "1",
});

console.log(
  "language-ocaml elaboration parity ok (native fast paths match Lisp fallback on corpus golden)",
);
