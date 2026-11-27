import {
  makePath,
  pathStep,
  pathSolved,
  type PathPuzzle,
} from "./boards/path.js";
import type { BoardGame } from "./board-catalog.js";
export type BoardPuzzle = PathPuzzle;
export interface BoardState {
  phase: "playing" | "solved" | "revealed" | "failed";
  values: string[];
  selected: number[];
  found: number[];
  moves: number;
  mistakes: number;
  notice: string;
}
export type BoardAction =
  | { type: "cell"; index: number }
  | { type: "input"; index: number; value: string }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "reveal" }
  | { type: "check" };
export function makeBoard(game: BoardGame, seed: string): BoardPuzzle {
  switch (game) {
    case "path":
      return makePath(seed);
  }
}
export function initialBoard(p: BoardPuzzle): BoardState {
  return {
    phase: "playing",
    values: Array(p.size * p.size).fill(""),
    selected: [],
    found: [],
    moves: 0,
    mistakes: 0,
    notice: "",
  };
}
// Playing + legal edit -> Playing/Solved. Terminal puzzles reject edits; Reset
// starts the same puzzle again. Reveal is terminal and never counts as solved.
export function stepBoard(
  p: BoardPuzzle,
  s: BoardState,
  a: BoardAction,
): BoardState {
  if (a.type === "reset") return initialBoard(p);
  if (s.phase !== "playing") return s;
  if (a.type === "reveal")
    return { ...s, phase: "revealed", selected: p.solution, notice: "" };
  if (a.type === "undo")
    return { ...s, selected: s.selected.slice(0, -1), notice: "" };
  if (a.type === "cell") {
    const selected = pathStep(p, s.selected, a.index);
    if (selected === s.selected) return s;
    return {
      ...s,
      selected,
      moves: s.moves + 1,
      notice: "",
      phase: pathSolved(p, selected) ? "solved" : "playing",
    };
  }
  return s;
}
export function restoreBoard(p: BoardPuzzle, raw: unknown): BoardState {
  const blank = initialBoard(p);
  if (!raw || typeof raw !== "object") return blank;
  const saved = raw as Partial<BoardState>;
  if (!Array.isArray(saved.selected) || saved.selected.length > p.size * p.size)
    return blank;
  let s = blank;
  for (const index of saved.selected) {
    if (typeof index !== "number") return blank;
    const next = stepBoard(p, s, { type: "cell", index });
    if (next === s) return blank;
    s = next;
  }
  if (saved.phase === "revealed") s = stepBoard(p, blank, { type: "reveal" });
  return s;
}
