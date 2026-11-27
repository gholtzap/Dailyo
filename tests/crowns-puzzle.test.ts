import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeCrowns,
  crownSolutions,
  crownsSolved,
} from "../src/games/boards/crowns.js";
test("Crowns boards have connected regions and exactly one valid solution", () => {
  const signatures = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const p = makeCrowns(`day:${i}`);
    assert.deepEqual(p, makeCrowns(`day:${i}`));
    const solutions = crownSolutions(p.regions, p.size);
    assert.equal(solutions.length, 1);
    assert.equal(crownsSolved(p, p.solution), true);
    for (let r = 0; r < p.size; r++) {
      const cells = p.regions.flatMap((v, i) => (v === r ? [i] : []));
      const seen = new Set([cells[0]]);
      const queue = [cells[0]];
      for (const cell of queue)
        for (const n of cells)
          if (
            !seen.has(n) &&
            Math.abs(Math.floor(n / p.size) - Math.floor(cell / p.size)) +
              Math.abs((n % p.size) - (cell % p.size)) ===
              1
          ) {
            seen.add(n);
            queue.push(n);
          }
      assert.equal(seen.size, cells.length);
    }
    signatures.add(p.regions.join(","));
  }
  assert.ok(signatures.size > 80);
});
test("Crowns rejects repeated or adjacent placements", () => {
  const p = makeCrowns("invalid");
  assert.equal(crownsSolved(p, [0, 1, 2, 3, 4, 5]), false);
  assert.equal(crownsSolved(p, []), false);
});
