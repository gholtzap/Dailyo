import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCrossword } from "../src/games/boards/crossword.js";
test("every Mini crossword clue corresponds to a complete word and every open square has a clue", () => {
  for (let n = 0; n < 200; n++) {
    const p = makeCrossword(`clues:${n}`);
    assert.deepEqual(p, makeCrossword(`clues:${n}`));
    const used = new Set<number>();
    for (const clue of p.clues) {
      assert.ok(clue.text.length > 3);
      assert.equal(clue.cells.length, 5);
      assert.match(clue.cells.map((i) => p.solution[i]).join(""), /^[A-Z]{5}$/);
      clue.cells.forEach((i) => used.add(i));
    }
    assert.equal(p.clues.length, 6);
    assert.equal(used.size, 21);
  }
});
