#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const destination = await mkdtemp(join(tmpdir(), "metacrdt-pack-"));

try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["pack", "--json", "--pack-destination", destination],
      { stdio: "inherit" },
    );

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm pack exited ${code}`));
    });
    child.on("error", reject);
  });
} finally {
  await rm(destination, { recursive: true, force: true });
}
