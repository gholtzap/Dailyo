import { wordBoard } from "./word-grid.js";
import { wordClues } from "./word-board-data.js";
export interface CrosswordPuzzle {
  kind: "crossword";
  size: 5;
  solution: string[];
  clues: {
    number: number;
    text: string;
    direction: "Across" | "Down";
    cells: number[];
  }[];
  numbers: Record<number, number>;
}
export function makeCrossword(seed: string): CrosswordPuzzle {
  const { words, solution } = wordBoard(seed + ":crossword");
  const numbers: Record<number, number> = { 0: 1, 2: 2, 4: 3, 10: 4, 20: 5 };
  const clues = words.map((word, index) => {
    const direction = index < 3 ? ("Across" as const) : ("Down" as const);
    const cells = Array.from({ length: 5 }, (_, i) =>
      index < 3 ? index * 10 + i : i * 5 + (index - 3) * 2,
    );
    return {
      number: numbers[cells[0]],
      text: wordClues[word],
      direction,
      cells,
    };
  });
  return { kind: "crossword", size: 5, solution, clues, numbers };
}
