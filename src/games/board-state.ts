import { makeCrowns, crownsSolved, type CrownPuzzle } from "./boards/crowns.js";
import {
  makePath,
  pathStep,
  pathSolved,
  type PathPuzzle,
} from "./boards/path.js";
import type { BoardGame } from "./board-catalog.js";
export type BoardPuzzle = PathPuzzle | CrownPuzzle;
export interface BoardState {
  phase: "playing" | "solved" | "revealed" | "failed";
  values: string[];
  history: string[][];
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
    case "crowns":
      return makeCrowns(seed);
    case "path":
      return makePath(seed);
  }
}
export function initialBoard(p: BoardPuzzle): BoardState {
  return {
    phase: "playing",
    values: Array(p.size * p.size).fill(""),
    history: [],
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
  if (p.kind === "crowns") {
    if (a.type === "reveal")
      return {
        ...s,
        phase: "revealed",
        values: s.values.map((_, i) => (p.solution.includes(i) ? "C" : "")),
        notice: "",
      };
    if (a.type === "undo") {
      const prior = s.history.at(-1);
      return prior
        ? { ...s, values: prior, history: s.history.slice(0, -1), notice: "" }
        : s;
    }
    if (a.type === "check")
      return {
        ...s,
        notice:
          "Use one crown in each row, column and region. Crowns cannot touch, even diagonally.",
      };
    if (
      a.type !== "cell" ||
      !Number.isInteger(a.index) ||
      a.index < 0 ||
      a.index >= s.values.length
    )
      return s;
    const values = [...s.values];
    values[a.index] =
      values[a.index] === "" ? "C" : values[a.index] === "C" ? "x" : "";
    return {
      ...s,
      values,
      history: [...s.history, s.values].slice(-200),
      moves: s.moves + 1,
      notice: "",
      phase: crownsSolved(
        p,
        values.flatMap((v, i) => (v === "C" ? [i] : [])),
      )
        ? "solved"
        : "playing",
    };
  }
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
  if (p.kind === "crowns") {
    if (
      !Array.isArray(saved.values) ||
      saved.values.length !== p.size * p.size ||
      !saved.values.every((v) => ["", "C", "x"].includes(v))
    )
      return blank;
    const history = Array.isArray(saved.history)
      ? saved.history
          .filter(
            (row) =>
              Array.isArray(row) &&
              row.length === saved.values!.length &&
              row.every((v) => ["", "C", "x"].includes(v)),
          )
          .slice(-200)
      : [];
    const phase = crownsSolved(
      p,
      saved.values.flatMap((v, i) => (v === "C" ? [i] : [])),
    )
      ? "solved"
      : saved.phase === "revealed"
        ? "revealed"
        : "playing";
    if (phase === "revealed") return stepBoard(p, blank, { type: "reveal" });
    return { ...blank, values: saved.values, history, phase };
  }
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
