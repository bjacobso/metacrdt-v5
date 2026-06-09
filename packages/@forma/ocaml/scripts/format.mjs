import { spawnSync } from "node:child_process";

const cwd = new URL("..", import.meta.url);

const canRun = (command, args) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0;
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error?.code === "ENOENT") {
    console.error(`Missing required command: ${command}.`);
    process.exit(127);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (canRun("opam", ["exec", "--", "ocamlformat", "--version"])) {
  run("opam", ["exec", "--", "dune", "fmt"]);
} else {
  run("dune", ["fmt"]);
}
