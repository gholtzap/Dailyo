import assert from "node:assert/strict";
import fs from "node:fs";
import {
  visualGames,
  prepareVisual,
  visualSet,
  visualPuzzle,
  emptyAnswer,
  answered,
  validAnswer,
  answerPoints,
  gradeVisual,
  rushCorrect,
} from "../dist/games/visual-puzzles.js";
const root = new URL("../dist/", import.meta.url);
for (const game of visualGames) {
  const rows = prepareVisual(
    game,
    JSON.parse(
      fs.readFileSync(new URL(`games/data/${game}.json`, root), "utf8"),
    ),
  );
  const questions = visualSet(game, rows, "2026-11-17");
  assert.equal(questions.length, 5);
  assert.equal(new Set(questions.map((q) => q.item.id)).size, 5);
  assert.deepEqual(questions, visualSet(game, rows, "2026-11-17"));
  assert.equal(
    visualPuzzle(questions),
    visualPuzzle(visualSet(game, rows, "2026-11-17")),
  );
  assert.notDeepEqual(questions, visualSet(game, rows, "practice:test"));
  for (const row of rows) {
    if (row.image)
      assert.ok(fs.statSync(new URL(row.image.slice(1), root)).size > 100);
    if (game === "pricerot") {
      assert.match(row.image, /\.webp$/);
      assert.ok(row.imageSource?.startsWith("https://"));
      const bytes = fs.readFileSync(new URL(row.image.slice(1), root));
      assert.equal(
        bytes.toString("ascii", 0, 4),
        "RIFF",
        "Product image must be a real WebP",
      );
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    }
    assert.ok(row.source.startsWith("https://"));
  }
  const answers = questions.map((q) => {
    const answer = emptyAnswer();
    assert.equal(answered(game, q, answer), false);
    if (game === "pricerot") answer.price = q.item.cents;
    else if (game === "orderrot")
      answer.order = [...q.tiles]
        .sort((a, b) => a.value - b.value)
        .map((x) => x.id);
    else answer.guesses = [q.item.id];
    assert.ok(validAnswer(game, q, answer));
    assert.ok(answered(game, q, answer));
    assert.equal(answerPoints(game, q, answer), 100);
    assert.ok(rushCorrect(game, q, answer));
    assert.equal(validAnswer(game, q, { ...answer, hint: 99 }), false);
    assert.equal(
      validAnswer(game, q, { ...answer, guesses: ["unlisted"] }),
      false,
    );
    assert.equal(answerPoints(game, q, { ...emptyAnswer(), skipped: true }), 0);
    return answer;
  });
  assert.equal(gradeVisual(game, questions, answers), 500);
  assert.equal(gradeVisual(game, questions, answers.slice(1)), undefined);
  const q = questions[0];
  if (game === "pricerot") {
    assert.ok(
      rushCorrect(game, q, {
        ...emptyAnswer(),
        price: Math.floor(q.item.cents * 1.2),
      }),
    );
    assert.equal(
      rushCorrect(game, q, {
        ...emptyAnswer(),
        price: Math.ceil(q.item.cents * 1.21),
      }),
      false,
    );
    assert.equal(validAnswer(game, q, { ...emptyAnswer(), price: -1 }), false);
    assert.equal(validAnswer(game, q, { ...emptyAnswer(), price: NaN }), false);
  } else if (game === "orderrot") {
    assert.equal(
      validAnswer(game, q, {
        ...emptyAnswer(),
        order: q.tiles.map(() => q.tiles[0].id),
      }),
      false,
    );
    assert.equal(
      visualSet(game, rows, "rush:orderrot:2026-11-17", true, 0)[0].tiles
        .length,
      3,
    );
  } else {
    const wrong = q.options.find((x) => x.id !== q.item.id).id;
    assert.ok(
      validAnswer(game, q, { ...emptyAnswer(), guesses: [wrong], hint: 1 }),
    );
    assert.equal(
      answerPoints(game, q, {
        ...emptyAnswer(),
        guesses: [wrong, q.item.id],
        hint: 1,
      }),
      65,
    );
    assert.equal(
      validAnswer(game, q, {
        ...emptyAnswer(),
        guesses: [q.item.id, wrong],
        hint: 1,
      }),
      false,
    );
    assert.equal(
      validAnswer(game, q, {
        ...emptyAnswer(),
        guesses: [wrong, wrong],
        hint: 2,
      }),
      false,
    );
  }
  // Rush gets a deterministic deck, cycling only after all rows have been used.
  const rush = rows.map(
    (_, round) => visualSet(game, rows, "rush:test", true, round)[0].item.id,
  );
  assert.equal(new Set(rush).size, rows.length);
  assert.equal(
    visualSet(game, rows, "rush:test", true, rows.length)[0].item.id,
    rush[0],
  );
}
console.log(
  "Five visual games: assets, determinism, replay validation, scoring, and Rush thresholds passed.",
);
