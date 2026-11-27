import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeSudoku,
  sudokuSolutions,
  sudokuSolved,
} from "../src/games/boards/sudoku.js";
test("Mini Sudoku boards have exactly one solution under row, column and 2 by 3 box rules", () => {
  const boards = new Set<string>();
  for (let n = 0; n < 100; n++) {
    const p = makeSudoku(`sudoku:${n}`);
    assert.deepEqual(p, makeSudoku(`sudoku:${n}`));
    assert.equal(sudokuSolutions(p.initial).length, 1);
    assert.ok(sudokuSolved(p.solution));
    assert.ok(p.initial.filter(Boolean).length <= 20);
    boards.add(p.initial.join(","));
  }
  assert.ok(boards.size > 90);
  assert.equal(sudokuSolved(Array(36).fill("1")), false);
});
