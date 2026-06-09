import { defineConfig, type UserConfig } from "tsdown";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

type PackageJson = {
  name?: string;
};

const cwd = process.cwd();
const pkg = JSON.parse(
  readFileSync(resolve(cwd, "package.json"), "utf8"),
) as PackageJson;

const singleEntry = ["src/index.ts"];

const packageEntries: Record<string, UserConfig["entry"]> = {
  "@metacrdt/convex": [
    "src/index.ts",
    "src/component/convex.config.ts",
    "src/component/schema.ts",
    "src/component/protocol.ts",
    "src/component/log.ts",
    "src/component/_generated/component.ts",
  ],
  "@forma/ts": ["src/*.ts"],
  "@forma/host": ["src/*.ts"],
  "@metacrdt/node": ["src/index.ts", "src/dev-server.ts"],
  "@metacrdt/views": ["src/index.ts", "src/runtime.ts"],
};

const nodeLikePackages = new Set(["@forma/ts", "@forma/host", "@metacrdt/node"]);

const packageName = pkg.name ?? basename(cwd);
const nodeLike = nodeLikePackages.has(packageName);

export default defineConfig({
  name: packageName,
  cwd,
  entry: packageEntries[packageName] ?? singleEntry,
  root: "src",
  format: "esm",
  dts: true,
  clean: true,
  platform: nodeLike ? "node" : "neutral",
  target: nodeLike ? "esnext" : "es2020",
  fixedExtension: packageName === "@forma/ts" || packageName === "@forma/host",
  unbundle: true,
});
