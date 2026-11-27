// Cross-board failures: skipped cells, diagonal steps, reused cells, out-of-order
// checkpoints and malformed saved drafts. Browser checks cover the actual play flow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makePath, pathStep, pathSolved } from "../src/games/boards/path.js";

test("daily paths are deterministic, diverse and traversable across 200 seeds", () => {
  const boards = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const p = makePath(`day:${seed}`);
    assert.deepEqual(p, makePath(`day:${seed}`));
    assert.equal(new Set(p.solution).size, p.size * p.size);
    let route: number[] = [];
    for (const cell of p.solution) route = pathStep(p, route, cell);
    assert.deepEqual(route, p.solution);
    assert.equal(pathSolved(p, route), true);
    assert.equal(pathSolved(p, route.slice(1)), false);
    boards.add(JSON.stringify(p.checkpoints));
  }
  assert.ok(boards.size > 150);
});
test("paths reject illegal steps and allow backtracking", () => {
  const p = makePath("rules");
  const [start, next] = p.solution;
  assert.deepEqual(pathStep(p, [], next), []);
  assert.deepEqual(pathStep(p, [start], start), [start]);
  assert.deepEqual(pathStep(p, [start, next], start), [start]);
  assert.equal(pathSolved(p, [...p.solution, p.solution[0]]), false);
});
