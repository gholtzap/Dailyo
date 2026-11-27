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
