import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

// Failures: an omitted command, duplicate execution, ignored arguments, or a hidden child failure.
test("browser shards cover every package command once and preserve child failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "dailyo-ci-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "tests"));
    await cp(
      resolve("scripts/ci-browser.mjs"),
      join(root, "scripts/ci-browser.mjs"),
    );
    await cp(resolve("tests/ci-parts.mjs"), join(root, "tests/ci-parts.mjs"));
    await writeFile(
      join(root, "ui-policy.json"),
      JSON.stringify({
        viewports: [
          { width: 390, height: 844 },
          { width: 1440, height: 1000 },
        ],
      }),
    );
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        type: "module",
        scripts: {
          "test:e2e":
            "node tests/a.mjs && node tests/b.mjs extra && node tests/c.mjs && node tests/puzzle-pools-browser.mjs && node tests/photo-map-motion.mjs && node tests/second-playtest.mjs",
          "test:e2e:world": "node tests/d.mjs",
        },
      }),
    );
    await writeFile(
      join(root, "scripts/world-cities.json"),
      JSON.stringify(["one", "two", "three", "four"].map((slug) => ({ slug }))),
    );
    await writeFile(
      join(root, "scripts/browser-timings.json"),
      JSON.stringify({
        durationsMs: {
          "node tests/a.mjs": 100,
          "node tests/b.mjs extra": 60,
          "node tests/c.mjs": 40,
          "node tests/d.mjs": 20,
          "node tests/puzzle-pools-browser.mjs": 12,
          "node tests/photo-map-motion.mjs": 12,
          "node tests/second-playtest.mjs": 12,
        },
      }),
    );
    for (const name of [
      "a",
      "b",
      "c",
      "d",
      "puzzle-pools-browser",
      "photo-map-motion",
      "second-playtest",
    ])
      await writeFile(
        join(root, `tests/${name}.mjs`),
        `import {appendFileSync} from 'node:fs';appendFileSync('visited',JSON.stringify(['${name}',...process.argv.slice(2)])+'\\n');`,
      );
    for (let shard = 1; shard <= 3; shard++)
      assert.equal(
        spawnSync(
          process.execPath,
          ["scripts/ci-browser.mjs", `--shard=${shard}/3`],
          { cwd: root },
        ).status,
        0,
      );
    const visited = (await readFile(join(root, "visited"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[])
      .sort();
    assert.deepEqual(
      visited.filter(
        (row) =>
          ![
            "d",
            "puzzle-pools-browser",
            "photo-map-motion",
            "second-playtest",
          ].includes(row[0]),
      ),
      [["a"], ["b", "extra"], ["c"]],
    );
    assert.deepEqual(
      visited
        .filter((row) => row[0] === "d")
        .flatMap((row) => row.slice(1))
        .sort(),
      ["four", "one", "three", "two"],
    );
    assert.deepEqual(
      visited
        .filter((row) => row[0] === "puzzle-pools-browser")
        .map((row) => row.slice(1).join(" "))
        .sort(),
      [390, 1440]
        .flatMap((width) =>
          ["skyrot", "skylinerot", "zoomrot"].flatMap((game) =>
            ["standard", "hard"].map(
              (difficulty) =>
                `--ci-width=${width} --ci-game=${game} --ci-difficulty=${difficulty}`,
            ),
          ),
        )
        .sort(),
      "Every photo game, viewport and difficulty must remain covered exactly once",
    );
    assert.deepEqual(
      visited
        .filter((r) => r[0] === "photo-map-motion")
        .map((r) => r.slice(1).join(" "))
        .sort(),
      [390, 1440]
        .flatMap((w) =>
          ["no-preference", "reduce"].map(
            (m) => `--ci-width=${w} --ci-motion=${m}`,
          ),
        )
        .sort(),
      "Every width and motion preference must run exactly once",
    );
    assert.deepEqual(
      visited
        .filter((r) => r[0] === "second-playtest")
        .map((r) => r.slice(1).join(" "))
        .sort(),
      [
        "--ci-viewport=390x844",
        "--ci-viewport=1440x1000",
        "--ci-viewport=390x600",
        "--ci-shared",
      ].sort(),
      "Every playtest viewport and shared recovery journey must run exactly once",
    );
    for (const shard of ["0/3", "4/3", "1/0", "wrong"])
      assert.notEqual(
        spawnSync(
          process.execPath,
          ["scripts/ci-browser.mjs", `--shard=${shard}`],
          { cwd: root },
        ).status,
        0,
      );
    for (const jobs of [2, 3, 4]) {
      await rm(join(root, "visited"));
      for (let shard = 1; shard <= 3; shard++)
        assert.equal(
          spawnSync(
            process.execPath,
            ["scripts/ci-browser.mjs", `--shard=${shard}/3`, `--jobs=${jobs}`],
            { cwd: root },
          ).status,
          0,
        );
      const concurrent = (await readFile(join(root, "visited"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[])
        .sort();
      assert.deepEqual(
        concurrent,
        visited,
        "Concurrent execution must preserve every argument and case",
      );
    }
    const heavyShards = new Set<number>();
    for (let shard = 1; shard <= 3; shard++) {
      const receipt = JSON.parse(
        await readFile(
          join(root, `test-results/ci-browser-${shard}.json`),
          "utf8",
        ),
      );
      for (const command of [
        "node tests/a.mjs",
        "node tests/b.mjs extra",
        "node tests/c.mjs",
      ])
        if (receipt.commands.includes(command)) heavyShards.add(shard);
    }
    assert.equal(
      heavyShards.size,
      3,
      "Spread the longest commands across runners instead of concentrating their CPU load",
    );
    await writeFile(join(root, "tests/a.mjs"), "process.exitCode=7;");
    for (const mode of [[], ["--jobs=2"], ["--jobs=3"], ["--jobs=4"]])
      assert.notEqual(
        spawnSync(
          process.execPath,
          ["scripts/ci-browser.mjs", "--shard=1/3", ...mode],
          {
            cwd: root,
          },
        ).status,
        0,
      );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
