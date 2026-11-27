import { shuffle } from "../../daily/puzzles.js";
export interface SudokuPuzzle {
  kind: "sudoku";
  size: 6;
  initial: string[];
  solution: string[];
}
export function sudokuSolutions(initial: string[], limit = 2): string[][] {
  const board = [...initial];
  const found: string[][] = [];
  function candidates(cell: number) {
    const r = Math.floor(cell / 6),
      c = cell % 6;
    return ["1", "2", "3", "4", "5", "6"].filter(
      (v) =>
        !board.some(
          (x, i) =>
            x === v &&
            (Math.floor(i / 6) === r ||
              i % 6 === c ||
              (Math.floor(Math.floor(i / 6) / 2) === Math.floor(r / 2) &&
                Math.floor((i % 6) / 3) === Math.floor(c / 3))),
        ),
    );
  }
  function visit() {
    if (found.length >= limit) return;
    let chosen = -1,
      options: string[] = [];
    for (let i = 0; i < 36; i++)
      if (!board[i]) {
        const values = candidates(i);
        if (!values.length) return;
        if (chosen < 0 || values.length < options.length) {
          chosen = i;
          options = values;
          if (values.length === 1) break;
        }
      }
    if (chosen < 0) {
      if (sudokuSolved(board)) found.push([...board]);
      return;
    }
    for (const value of options) {
      board[chosen] = value;
      visit();
      board[chosen] = "";
    }
  }
  visit();
  return found;
}
export function sudokuSolved(values: string[]): boolean {
  if (values.length !== 36 || !values.every((v) => /^[1-6]$/.test(v)))
    return false;
  for (let r = 0; r < 6; r++) {
    if (new Set(values.slice(r * 6, r * 6 + 6)).size !== 6) return false;
    if (
      new Set(Array.from({ length: 6 }, (_, i) => values[i * 6 + r])).size !== 6
    )
      return false;
  }
  for (let row = 0; row < 6; row += 2)
    for (let col = 0; col < 6; col += 3)
      if (
        new Set(
          [0, 1, 2, 6, 7, 8].map((delta) => values[row * 6 + col + delta]),
        ).size !== 6
      )
        return false;
  return true;
}
export function makeSudoku(seed: string): SudokuPuzzle {
  const digits = shuffle(["1", "2", "3", "4", "5", "6"], seed + ":digits");
  const rows = shuffle([0, 1, 2], seed + ":bands").flatMap((b) =>
    shuffle([b * 2, b * 2 + 1], seed + ":row:" + b),
  );
  const cols = shuffle([0, 1], seed + ":stacks").flatMap((b) =>
    shuffle([b * 3, b * 3 + 1, b * 3 + 2], seed + ":col:" + b),
  );
  const solution = rows.flatMap((row) =>
    cols.map((col) => digits[(row * 3 + Math.floor(row / 2) + col) % 6]),
  );
  const initial = [...solution];
  for (const cell of shuffle(
    Array.from({ length: 36 }, (_, i) => i),
    seed + ":remove",
  )) {
    if (initial.filter(Boolean).length <= 14) break;
    const value = initial[cell];
    initial[cell] = "";
    if (sudokuSolutions(initial).length !== 1) initial[cell] = value;
  }
  return { kind: "sudoku", size: 6, initial, solution };
}
