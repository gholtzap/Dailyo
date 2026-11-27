import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGroups } from "../src/games/boards/groups.js";
import { initialBoard, stepBoard } from "../src/games/board-state.js";
test("Groups has sixteen distinct words and accepts each intended partition exactly once", () => {
  for (let n = 0; n < 100; n++) {
    const p = makeGroups(`groups:${n}`);
    assert.equal(new Set(p.items).size, 16);
    let s = initialBoard(p);
    for (const group of p.groups) {
      for (const word of group.words)
        s = stepBoard(p, s, { type: "cell", index: p.items.indexOf(word) });
      s = stepBoard(p, s, { type: "check" });
    }
    assert.equal(s.phase, "solved");
    assert.equal(s.found.length, 4);
    assert.equal(s.mistakes, 0);
    assert.equal(stepBoard(p, s, { type: "check" }), s);
  }
});
test("a repeated incorrect group cannot consume another mistake", () => {
  const p = makeGroups("repeat");
  let s = initialBoard(p);
  const mixed = p.groups.map((g) => p.items.indexOf(g.words[0]));
  for (const i of mixed) s = stepBoard(p, s, { type: "cell", index: i });
  s = stepBoard(p, s, { type: "check" });
  assert.equal(s.mistakes, 1);
  s = stepBoard(p, s, { type: "check" });
  assert.equal(s.mistakes, 1);
});
