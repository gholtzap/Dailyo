import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const planning = process.argv[2] === "--plan";
const match = (planning ? "--shard=1/18" : process.argv[2])?.match(
  /^--shard=(\d+)\/(\d+)$/,
);
assert.ok(
  match && [3, 4].includes(process.argv.length),
  "Use --shard=index/count [--jobs=1|2]",
);
const jobsArg = process.argv[3] ?? "--jobs=1";
assert.match(jobsArg, /^--jobs=[12]$/);
const jobs = Number(jobsArg.split("=")[1]);
const index = Number(match[1]),
  count = Number(match[2]);
const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
const { durationsMs } = JSON.parse(
  readFileSync("scripts/browser-timings.json", "utf8"),
);
const cities = JSON.parse(readFileSync("scripts/world-cities.json", "utf8"));
assert.ok(count >= 1 && count <= cities.length, "Invalid city shard count");
assert.equal(
  new Set(cities.map((city) => city.slug)).size,
  cities.length,
  "City slugs must be unique",
);
const groups = Array.from({ length: count }, () => []);
for (const [i, city] of cities.entries()) {
  assert.match(city.slug, /^[a-z0-9-]+$/);
  groups[i % count].push(city.slug);
}
const actualWorld =
  scripts["test:e2e:world"] === "node tests/trainrot-world.mjs";
const world = groups.map(
  (cities) =>
    `${scripts["test:e2e:world"]} ${cities.join(" ")}${actualWorld ? " --ci-cities-only" : ""}`,
);
for (const command of world)
  durationsMs[command] ??= durationsMs[scripts["test:e2e:world"]] / count;
if (actualWorld) {
  world.push("node tests/trainrot-world.mjs --ci-shared");
  durationsMs[world.at(-1)] ??= 5000;
}
const split = {
  "node tests/puzzle-pools-browser.mjs": [390, 1440].flatMap((width) =>
    ["skyrot", "skylinerot", "zoomrot"].map(
      (game) => `--ci-width=${width} --ci-game=${game}`,
    ),
  ),
  "node tests/visual-games.mjs": [
    ...[1280, 390].map((width) => `--ci-width=${width}`),
    "--ci-shared",
  ],
  "node tests/daily-feed.mjs": [390, 1440].map(
    (width) => `--ci-width=${width}`,
  ),
  "node tests/world-games.mjs": [
    ...[390, 1440].map((width) => `--ci-width=${width}`),
    "--ci-shared",
  ],
  "node tests/perception-games.mjs": [
    ...[390, 1440].map((width) => `--ci-width=${width}`),
    "--ci-shared",
  ],
};
const browser = scripts["test:e2e"].split(" && ").flatMap((command) => {
  const parts = split[command];
  if (!parts) return [command];
  return parts.map((part) => {
    const key = `${command} ${part}`;
    durationsMs[key] ??= durationsMs[command] / parts.length;
    return key;
  });
});
const commands = [...browser, ...world];
assert.equal(
  new Set(commands).size,
  commands.length,
  "Each browser command must occur once",
);
assert.ok(
  index >= 1 && index <= count && count <= commands.length,
  "Select a nonempty shard",
);
const fallback = Math.max(1, ...Object.values(durationsMs));
const duration = (command) =>
  Number.isFinite(durationsMs[command]) && durationsMs[command] > 0
    ? durationsMs[command]
    : fallback;
const shards = Array.from({ length: count }, () => ({
  commands: [],
  estimatedMs: 0,
}));
for (const command of commands.sort(
  (a, b) => duration(b) - duration(a) || a.localeCompare(b),
)) {
  const shard = shards.reduce((best, next) =>
    next.estimatedMs < best.estimatedMs ? next : best,
  );
  shard.commands.push(command);
  shard.estimatedMs += duration(command);
}
if (planning) {
  console.log(
    JSON.stringify(
      shards.map((shard, i) => ({
        index: i + 1,
        count,
        estimatedMs: shard.estimatedMs,
      })),
    ),
  );
  process.exit(0);
}
mkdirSync("test-results", { recursive: true });
const receipt = { index, count, ...shards[index - 1], results: [] };
let next = 0;
async function worker() {
  while (next < receipt.commands.length) {
    const command = receipt.commands[next++];
    const [program, file, ...args] = command.split(" ");
    assert.equal(program, "node");
    assert.match(file, /^tests\/[\w-]+\.mjs$/);
    const start = performance.now();
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [file, ...args], {
        stdio: "inherit",
        env: { ...process.env, WORLD_TEST_CITIES: "" },
      });
      child.once("error", (error) =>
        resolve({ status: 1, error: String(error) }),
      );
      child.once("exit", (status, signal) => resolve({ status, signal }));
    });
    receipt.results.push({
      command,
      durationMs: performance.now() - start,
      ...result,
    });
    writeFileSync(
      `test-results/ci-browser-${index}.json`,
      JSON.stringify(receipt, null, 2) + "\n",
    );
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
