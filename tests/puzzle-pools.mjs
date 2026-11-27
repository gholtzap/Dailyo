// Content integrity checks run against the shipped decks, not an alternate fixture.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { prepareExtra, extraPuzzle } from "../dist/games/extra-puzzles.js";
import { prepareVisual, visualSet } from "../dist/games/visual-puzzles.js";
const read = (name) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../dist/games/data/${name}.json`, import.meta.url),
    ),
  );
const ladders = read("ladderrot");
assert.ok(ladders.length >= 1000, `Only ${ladders.length} ladders`);
assert.equal(
  new Set(ladders.map((pair) => [...pair].sort().join("-"))).size,
  ladders.length,
  "No reversed or duplicate ladders",
);
const data = prepareExtra("ladderrot", ladders, read("ladder-words"));
for (let i = 0; i < ladders.length; i++) {
  const puzzle = extraPuzzle(
    "ladderrot",
    data,
    `practice:deck:${i}:content-check`,
  );
  assert.ok(
    puzzle.solution.length >= 3 && puzzle.solution.length <= 15,
    `Unsuitable ladder ${puzzle.id}`,
  );
}
for (const game of ["skyrot", "skylinerot", "zoomrot"]) {
  const rows = prepareVisual(game, read(game));
  assert.ok(rows.length >= 36, `${game}: only ${rows.length} photographs`);
  assert.equal(
    new Set(rows.map((row) => row.name.toLowerCase())).size,
    rows.length,
    "Use distinct subjects, not alternate photographs of the same answer",
  );
  const hashes = new Set();
  for (const row of rows) {
    assert.ok(
      row.credit && row.license && /public domain|cc0|cc.by/i.test(row.license),
      `${row.id}: missing attribution`,
    );
    const bytes = fs.readFileSync(
      new URL(`../dist${row.image}`, import.meta.url),
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(!hashes.has(hash), `${game}/${row.id}: duplicate image`);
    hashes.add(hash);
  }
  // Every photo participates in the real seeded question selection at every difficulty.
  for (let round = 0; round < rows.length; round++)
    for (const difficulty of ["easy", "standard", "hard"]) {
      const q = visualSet(
        game,
        rows,
        "content-check",
        true,
        round,
        difficulty,
      )[0];
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options.map((x) => x.name.toLowerCase())).size, 4);
    }
}
const issued = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/issued-puzzle-pools.json", import.meta.url),
  ),
);
for (const [date, expected] of Object.entries(issued)) {
  assert.equal(
    extraPuzzle("ladderrot", data, date).id,
    expected.ladderrot,
    "Preserve issued ladder puzzles",
  );
  for (const game of ["skyrot", "skylinerot", "zoomrot"])
    for (const rush of [false, true]) {
      const questions = visualSet(
        game,
        read(game),
        rush ? `rush:${game}:${date}` : date,
        rush,
        0,
      );
      assert.deepEqual(
        questions.map((q) => [q.item.id, q.options.map((x) => x.id)]),
        expected[game][rush ? "rush" : "daily"],
        "Preserve issued photo questions and choices",
      );
    }
}
console.log(
  "Expanded pools: 100+ solvable ladders and 36+ distinct attributed photos per game.",
);
