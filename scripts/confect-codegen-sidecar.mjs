#!/usr/bin/env node
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const tempConfig = "convex.json";
const tempTarget = ".confect-convex-target";

try {
  await access(tempConfig);
  throw new Error(`${tempConfig} already exists; refusing to overwrite it`);
} catch (err) {
  if (err?.code !== "ENOENT") throw err;
}

async function run(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
    child.on("error", reject);
  });
}

await rm(tempTarget, { recursive: true, force: true });
await mkdir(tempTarget, { recursive: true });
await writeFile(tempConfig, JSON.stringify({ functions: tempTarget }, null, 2));

try {
  await run("pnpm", ["exec", "confect", "codegen"]);
} finally {
  await rm(tempConfig, { force: true });
  await rm(tempTarget, { recursive: true, force: true });
}
