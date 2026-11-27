import { hash, shuffle } from "../../daily/puzzles.js";
import { wordBoards } from "./word-board-data.js";
export interface WordGridPuzzle {
  kind: "wordgrid";
  size: 5;
  words: string[];
  solution: string[];
  initial: string[];
  maxMoves: number;
}
export function wordBoard(seed: string) {
  const words = wordBoards[hash(seed) % wordBoards.length];
  const solution = Array(25).fill("#");
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++)
      solution[row * 10 + col] = words[row][col];
  for (let col = 0; col < 3; col++)
    for (let row = 0; row < 5; row++)
      solution[row * 5 + col * 2] = words[col + 3][row];
  return { words, solution };
}
export function makeWordGrid(seed: string): WordGridPuzzle {
  const { words, solution } = wordBoard(seed);
  const initial = [...solution];
  const cells = shuffle(
    solution.flatMap((v, i) => (v !== "#" ? [i] : [])),
    seed + ":tiles",
  );
  let pairs = 0;
  while (cells.length > 1 && pairs < 8) {
    const a = cells.shift()!;
    const j = cells.findIndex((b) => initial[a] !== initial[b]);
    if (j < 0) break;
    const b = cells.splice(j, 1)[0];
    [initial[a], initial[b]] = [initial[b], initial[a]];
    pairs++;
  }
  return { kind: "wordgrid", size: 5, words, solution, initial, maxMoves: 15 };
}
