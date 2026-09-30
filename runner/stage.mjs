// Fill runner/build/ with the Docker build context: the runner code plus only the
// repo files jobs.json "image.include" lists (model/sumo/work alone is 18 GB).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = dirname(fileURLToPath(import.meta.url));
const repo = join(runner, "..");
const build = join(runner, "build");
const { image } = JSON.parse(readFileSync(join(runner, "jobs.json"), "utf8"));

rmSync(build, { recursive: true, force: true });
mkdirSync(join(build, "app"), { recursive: true });
for (const file of ["Dockerfile", "requirements.txt", "jobs.json"]) cpSync(join(runner, file), join(build, file));
cpSync(join(runner, "container"), join(build, "container"), {
  recursive: true,
  filter: (src) => !src.includes("__pycache__"),
});

for (const path of image.include) {
  const from = join(repo, path);
  if (!existsSync(from)) throw new Error(`jobs.json image.include: ${path} does not exist`);
  cpSync(from, join(build, "app", path), { recursive: true, filter: (src) => !src.includes("__pycache__") });
}
console.log(`staged ${image.include.length} paths into runner/build/`);
