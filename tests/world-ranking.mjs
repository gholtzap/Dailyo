import assert from "node:assert/strict";
import fs from "node:fs";
const bundle = new URL("../.test-build/dist/", import.meta.url);
for (const name of [
  "data/network.json",
  "data/challenges.json",
  "world-data/cities.json",
  ...fs
    .readdirSync(new URL("../dist/world-data/", import.meta.url), {
      withFileTypes: true,
    })
    .filter((d) => d.isDirectory())
    .flatMap((d) => [
      `world-data/${d.name}/network.json`,
      `world-data/${d.name}/challenges.json`,
    ]),
]) {
  const target = new URL(name, bundle);
  fs.mkdirSync(new URL("./", target), { recursive: true });
  fs.copyFileSync(new URL("../dist/" + name, import.meta.url), target);
}
const { grade } = await import("../.test-build/api/daily-score.js");
import { createRouter } from "../dist/router.js";
import { dailyDate, trainPuzzle } from "../dist/daily/puzzles.js";
import { worldDailyChallenge } from "../dist/world.js";
const root = new URL("../dist/", import.meta.url),
  read = (p) => JSON.parse(fs.readFileSync(new URL(p, root)));
const cities = read("world-data/cities.json"),
  day = dailyDate();
for (const city of cities) {
  const network = read(
    city.slug === "nyc"
      ? "data/network.json"
      : `world-data/${city.slug}/network.json`,
  );
  network.metadata.feedVersion = city.feedVersion;
  const challenges = read(
    city.slug === "nyc"
      ? "data/challenges.json"
      : `world-data/${city.slug}/challenges.json`,
  );
  const c = worldDailyChallenge(challenges, day, city.slug),
    puzzle = trainPuzzle(network, c),
    answer = createRouter(network)
      .best(c.from, c.to)
      .legs.map((l) => ({ route: l.route }));
  assert.equal(
    grade(puzzle, "train", day, [answer]),
    100,
    `${city.slug}: server replay`,
  );
  assert.equal(
    grade(puzzle, "train", day, [[{ route: "does-not-exist" }]]),
    undefined,
  );
  const changed = JSON.parse(puzzle);
  changed[0] = "world-invalid-version";
  assert.equal(
    grade(JSON.stringify(changed), "train", day, [answer]),
    undefined,
  );
}
console.log(
  "All 98 city daily results replay correctly on the server; invalid versions and routes rejected.",
);
