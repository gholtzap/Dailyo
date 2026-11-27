import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWordGrid } from "../src/games/boards/word-grid.js";
import { initialBoard, stepBoard } from "../src/games/board-state.js";
test("word grids contain six intersecting words and can be solved within the swap budget", () => {
  const ids = new Set();
  for (let n = 0; n < 200; n++) {
    const p = makeWordGrid(`word:${n}`);
    assert.deepEqual(p, makeWordGrid(`word:${n}`));
    ids.add(p.words.join(","));
    assert.deepEqual([...p.initial].sort(), [...p.solution].sort());
    for (let line = 0; line < 3; line++) {
      assert.equal(
        p.solution.slice(line * 10, line * 10 + 5).join(""),
        p.words[line],
      );
      assert.equal(
        [0, 1, 2, 3, 4].map((r) => p.solution[r * 5 + line * 2]).join(""),
        p.words[line + 3],
      );
    }
    let s = initialBoard(p);
    for (let i = 0; i < 25; i++)
      if (s.values[i] !== p.solution[i]) {
        const j = s.values.findIndex(
          (v, k) => v === p.solution[i] && v !== p.solution[k],
        );
        assert.ok(j >= 0);
        s = stepBoard(p, s, { type: "cell", index: i });
        s = stepBoard(p, s, { type: "cell", index: j });
      }
    assert.equal(s.phase, "solved");
    assert.ok(s.moves <= p.maxMoves);
  }
  assert.ok(ids.size > 70);
});

import { wordBoards, wordClues } from "../src/games/boards/word-board-data.js";
import { makeCrossword } from "../src/games/boards/crossword.js";
import { readFileSync } from "node:fs";
test("every curated layout has six distinct clued words with matching crossings", () => {
  const seen = new Set<string>();
  for (const words of wordBoards) {
    assert.equal(words.length, 6);
    assert.equal(new Set(words).size, 6);
    assert.ok(!seen.has(words.join("/")));
    seen.add(words.join("/"));
    for (const word of words) assert.ok(wordClues[word]);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++)
        assert.equal(words[row][col * 2], words[col + 3][row * 2]);
  }
});
test("issued word grids and crosswords retain their puzzle and clues", () => {
  const issued = JSON.parse(
    readFileSync(
      new URL("./fixtures/issued-word-boards.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(makeWordGrid("2026-11-27"), issued.wordgrid);
  assert.deepEqual(makeCrossword("2026-11-27"), issued.crossword);
});
