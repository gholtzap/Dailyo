import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
for (const game of visualGames) {
  const source = resolve(`dist/games/data/${game}.json`);
  const destination = new URL(`${game}.json`, target);
  if (source !== fileURLToPath(destination)) copyFileSync(source, destination);
}
for (const game of visualGames)
  for (const day of game === "pricerot"
    ? ["2026-11-17", "2026-11-27"]
    : ["2026-11-17"])
    test(`${game} ${day}: API grades daily answers from the bundled data and rejects altered results`, () => {
      const rows = prepareVisual(
        game,
        JSON.parse(readFileSync(`dist/games/data/${game}.json`, "utf8")),
      );
      const questions = visualSet(game, rows, day);
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
      assert.equal(grade(puzzle, game, day, json), 500);
      assert.equal(grade("altered", game, day, json), undefined);
      assert.equal(grade(puzzle, game, day, json.slice(1)), undefined);
      assert.equal(grade(puzzle, game, day, [{}, ...json.slice(1)]), undefined);
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

test("pricerot expansion preserves issued daily puzzles and releases the full catalog for new days, Practice, and Rush", () => {
  const original = prepareVisual(
    "pricerot",
    JSON.parse(readFileSync("dist/games/data/pricerot.json", "utf8")),
  ).slice(0, 12);
  const expanded = [
    ...original,
    ...Array.from({ length: 100 }, (_, index) => ({
      ...original[0]!,
      id: `added-${index}`,
    })),
  ];
  for (const day of ["2026-11-17", "2026-11-26"]) {
    assert.deepEqual(
      visualSet("pricerot", expanded, day),
      visualSet("pricerot", original, day),
    );
  }
  for (const seed of [
    "2026-11-27",
    "practice:expanded",
    "rush:pricerot:2026-11-26:new-run",
  ]) {
    const deck = expanded.map(
      (_, round) =>
        visualSet("pricerot", expanded, seed, true, round)[0]!.item.id,
    );
    assert.equal(new Set(deck).size, expanded.length);
  }
  const questions = visualSet("pricerot", expanded, "2026-11-27");
  assert.ok(questions.some((q) => q.item.id.startsWith("added-")));
});
