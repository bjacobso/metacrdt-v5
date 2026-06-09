import { rmSync } from "node:fs";

const packageDir = new URL("..", import.meta.url);

for (const path of ["_build", "dist"]) {
  rmSync(new URL(`${path}/`, packageDir), { recursive: true, force: true });
}
