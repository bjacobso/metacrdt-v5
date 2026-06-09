import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { packageDir } from "./corpus.mjs";

export const nativeCli = resolve(packageDir, "dist/native/oo_lang_cli.exe");

export const requireNativeCli = () => {
  if (existsSync(nativeCli)) return nativeCli;

  throw new Error(
    "Missing dist/native/oo_lang_cli.exe. Run through Turbo so @open-ontology/language-ocaml#build completes first.",
  );
};
