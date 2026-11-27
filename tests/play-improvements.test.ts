import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  searchCountries,
  exactCountryMatch,
} from "../src/games/country-search.js";
import {
  prepareExtra,
  extraPuzzle,
  initialExtra,
  stepExtra,
  replayExtra,
} from "../src/games/extra-puzzles.js";
import { makeSet, preparePuzzles } from "../src/games/rot-puzzles.js";
import {
  visualSet,
  prepareVisual,
  photoScale,
  photoPoints,
} from "../src/games/visual-puzzles.js";
import { parseDifficulty, practiceSlot } from "../src/games/difficulty.js";
import type { Country, YearQuestion } from "../src/games/rot-types.js";
const data = (name: string) =>
  JSON.parse(fs.readFileSync(`dist/games/data/${name}.json`, "utf8"));
const countries: Country[] = data("borderrot").map(
  ([id, name, neighbours]: [string, string, string[]]) => ({
    id,
    name,
    neighbours,
  }),
);

test("country search finds words, common aliases, abbreviations and accent variants", () => {
  assert.deepEqual(
    new Set(searchCountries(countries, "Congo").map((c) => c.id)),
    new Set(["CD", "CG"]),
  );
  for (const [query, id] of [
    ["DRC", "CD"],
    ["D.R.C.", "CD"],
    ["U.S.", "US"],
    ["Democratic Republic", "CD"],
    ["Congo Brazzaville", "CG"],
    ["Ivory Coast", "CI"],
    ["Côte d’Ivoire", "CI"],
    ["UK", "GB"],
    ["Turkey", "TR"],
    ["Burma", "MM"],
  ]) {
    assert.equal(searchCountries(countries, query)[0]?.id, id, query);
  }
  assert.deepEqual(searchCountries(countries, "  "), []);
  assert.deepEqual(searchCountries(countries, "<script>"), []);
  assert.ok(
    exactCountryMatch(
      countries.find((c) => c.id === "CD")!,
      "DRC",
    ),
  );
  assert.equal(
    searchCountries(
      countries.filter((c) => c.id !== "CD"),
      "DRC",
    ).length,
    0,
    "selected countries stay excluded",
  );
});

test("ladder undo restores a replayable prefix, including at the move limit", () => {
  const prepared = prepareExtra(
    "ladderrot",
    data("ladderrot"),
    data("ladder-words"),
  );
  const puzzle = extraPuzzle("ladderrot", prepared, "2026-11-17");
  assert.equal(puzzle.game, "ladderrot");
  if (puzzle.game !== "ladderrot") return;
  const initial = initialExtra("ladderrot", puzzle);
  assert.equal(stepExtra("ladderrot", puzzle, initial, "undo"), initial);
  const advanced = stepExtra("ladderrot", puzzle, initial, puzzle.solution[1]);
  const undone = stepExtra("ladderrot", puzzle, advanced, "undo");
  assert.deepEqual(undone, initial);
  assert.deepEqual(replayExtra("ladderrot", puzzle, undone.moves), initial);
  assert.equal(
    stepExtra("ladderrot", puzzle, { ...advanced, phase: "complete" }, "undo")
      .phase,
    "complete",
  );
  const limited = { ...advanced, moves: Array(100).fill(puzzle.solution[1]) };
  assert.equal(
    stepExtra("ladderrot", puzzle, limited, "undo").moves.length,
    99,
  );
  let finished = initial;
  for (const word of puzzle.solution.slice(1))
    finished = stepExtra("ladderrot", puzzle, finished, word);
  assert.equal(finished.score, puzzle.solution.length - 1);
  assert.deepEqual(replayExtra("ladderrot", puzzle, finished.moves), finished);
});

test("difficulty preferences safely default and isolate existing practice saves", () => {
  assert.equal(parseDifficulty("hard"), "hard");
  assert.equal(parseDifficulty({}), "standard");
  assert.equal(practiceSlot("standard"), "practice");
  assert.equal(practiceSlot("hard"), "practice:hard");
});

test("hard photo choices are curated, deterministic, and preserve the daily deck", () => {
  for (const game of ["zoomrot", "skyrot", "skylinerot"] as const) {
    const rows = prepareVisual(game, data(game));
    assert.deepEqual(
      visualSet(game, rows, "day"),
      visualSet(game, rows, "day", false, 0, "standard"),
    );
    const hard = visualSet(game, rows, "day", false, 0, "hard");
    assert.deepEqual(hard, visualSet(game, rows, "day", false, 0, "hard"));
    for (const q of hard) {
      assert.equal(new Set(q.options.map((x) => x.id)).size, 4);
      const alternatives = q.options.filter((x) => x.id !== q.item.id);
      if (q.item.lookalikes)
        assert.deepEqual(
          new Set(alternatives.map((x) => x.name)),
          new Set(q.item.lookalikes),
        );
      else
        assert.ok(
          alternatives.every((x) => q.item.distractors?.includes(x.id)),
        );
    }
    assert.ok(photoScale(game, "hard", 0) > photoScale(game, "easy", 0));
    assert.equal(photoScale(game, "hard", 2), 1);
    assert.deepEqual(
      visualSet(game, rows, "day", true, 0, "hard"),
      visualSet(game, rows, "day", true, 0, "standard"),
      "Rush remains shared",
    );
  }
  assert.deepEqual([0, 1, 2].map(photoPoints), [100, 65, 35]);
});

test("hard timeline anchors bracket the answer closely without revealing future questions", () => {
  const prepared = preparePuzzles("yearrot", data("yearrot"));
  for (let i = 0; i < 30; i++) {
    const seed = `practice:${i}`;
    assert.deepEqual(
      makeSet("yearrot", prepared, seed),
      makeSet("yearrot", prepared, seed, 0, "standard"),
    );
    const questions = makeSet(
      "yearrot",
      prepared,
      seed,
      0,
      "hard",
    ) as YearQuestion[];
    for (const [index, q] of questions.entries()) {
      assert.equal(q.timeline.length, index + 2);
      assert.ok(
        q.timeline.every((row, i) => !i || row[0] > q.timeline[i - 1][0]),
      );
      assert.ok(
        q.timeline.every(
          (row) =>
            !questions
              .slice(index)
              .some((future) => future.event[0] === row[0]),
        ),
      );
      const pool = (prepared.items as [number, string][]).filter(
        (row) => !questions.some((other) => other.event[0] === row[0]),
      );
      const before = pool
        .filter((row) => row[0] < q.event[0])
        .sort((a, b) => b[0] - a[0])[0];
      const after = pool
        .filter((row) => row[0] > q.event[0])
        .sort((a, b) => a[0] - b[0])[0];
      if (before && after)
        assert.ok(
          q.timeline.some((row) => row[0] === before[0]) &&
            q.timeline.some((row) => row[0] === after[0]),
        );
    }
  }
});

test("saved Rush UUIDs retain their issued photo decks after content expansion", () => {
  for (const game of ["skyrot", "skylinerot", "zoomrot"] as const) {
    const rows = prepareVisual(game, data(game));
    for (const date of ["2026-11-17", "2026-11-27"]) {
      const seed = `rush:${game}:${date}:00000000-0000-4000-8000-000000000001`;
      const issued = visualSet(game, rows.slice(0, 36), seed, true, 0);
      const current = visualSet(game, rows, seed, true, 0);
      assert.deepEqual(
        current.map((q) => [q.item.id, q.options.map((o) => o.id)]),
        issued.map((q) => [q.item.id, q.options.map((o) => o.id)]),
      );
    }
  }
});
