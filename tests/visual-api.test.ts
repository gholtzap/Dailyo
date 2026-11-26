import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { grade } from "../api/daily-score.js";
import {
  visualGames,
  visualSet,
  visualPuzzle,
  prepareVisual,
  emptyAnswer,
} from "../src/games/visual-puzzles.js";
import type { JsonValue } from "../src/types.js";

// Compiled API modules resolve bundled data relative to their deployment root.
const target = new URL("../dist/games/data/", import.meta.url);
mkdirSync(target, { recursive: true });
for (const game of visualGames)
  copyFileSync(`dist/games/data/${game}.json`, new URL(`${game}.json`, target));
for (const game of visualGames)
  test(`${game}: API grades daily answers from the bundled data and rejects altered results`, () => {
    const rows = prepareVisual(
      game,
      JSON.parse(readFileSync(`dist/games/data/${game}.json`, "utf8")),
    );
    const questions = visualSet(game, rows, "2026-11-17");
    const answers = questions.map((q) => {
      const a = emptyAnswer();
      if (game === "pricerot") a.price = q.item.cents!;
      else if (game === "orderrot")
        a.order = [...q.tiles]
          .sort((x, y) => x.value - y.value)
          .map((x) => x.id);
      else a.guesses = [q.item.id];
      return { ...a };
    });
    const puzzle = visualPuzzle(questions);
    const json = answers as JsonValue[];
    assert.equal(grade(puzzle, game, "2026-11-17", json), 500);
    assert.equal(grade("altered", game, "2026-11-17", json), undefined);
    assert.equal(grade(puzzle, game, "2026-11-17", json.slice(1)), undefined);
    assert.equal(
      grade(puzzle, game, "2026-11-17", [{}, ...json.slice(1)]),
      undefined,
    );
  });

test("pricerot excludes missing images and illustrations before selecting daily, practice, and Rush puzzles", () => {
  const rows = JSON.parse(
    readFileSync("dist/games/data/pricerot.json", "utf8"),
  );
  const invalid = [
    { ...rows[0], id: "no-image", image: undefined },
    { ...rows[0], id: "illustration", image: "/games/media/price-banana.svg" },
    { ...rows[0], id: "unattributed", imageSource: undefined },
  ];
  const prepared = prepareVisual("pricerot", [...rows, ...invalid]);
  assert.deepEqual(
    prepared.map((row) => row.id),
    rows.map((row: { id: string }) => row.id),
  );
  for (const seed of [
    "2026-11-26",
    "practice:product-images",
    "rush:product-images",
  ]) {
    for (let round = 0; round < rows.length; round++) {
      const questions = visualSet(
        "pricerot",
        prepared,
        seed,
        seed.startsWith("rush:"),
        round,
      );
      assert.ok(
        questions.every((q) => !invalid.some((row) => row.id === q.item.id)),
      );
    }
  }
  assert.throws(() => prepareVisual("pricerot", invalid), /Not enough puzzles/);
});
