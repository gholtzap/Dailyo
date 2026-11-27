import { makeGroups, type GroupsPuzzle } from "./boards/groups.js";
import { makeCrossword, type CrosswordPuzzle } from "./boards/crossword.js";
import { makeWordGrid, type WordGridPuzzle } from "./boards/word-grid.js";
import { makeCrowns, crownsSolved, type CrownPuzzle } from "./boards/crowns.js";
import {
  makePath,
  pathStep,
  pathSolved,
  type PathPuzzle,
} from "./boards/path.js";
import type { BoardGame } from "./board-catalog.js";
export type BoardPuzzle =
  PathPuzzle | CrownPuzzle | WordGridPuzzle | CrosswordPuzzle | GroupsPuzzle;
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
    case "groups":
      return makeGroups(seed);
    case "crossword":
      return makeCrossword(seed);
    case "wordgrid":
      return makeWordGrid(seed);
    case "crowns":
      return makeCrowns(seed);
    case "path":
      return makePath(seed);
  }
}
export function initialBoard(p: BoardPuzzle): BoardState {
  return {
    phase: "playing",
    values:
      p.kind === "wordgrid"
        ? [...p.initial]
        : p.kind === "crossword"
          ? p.solution.map((v) => (v === "#" ? "#" : ""))
          : Array(p.size * p.size).fill(""),
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
  if (p.kind === "groups") {
    if (a.type === "reveal" && s.phase !== "solved")
      return {
        ...s,
        phase: "revealed",
        found: [0, 1, 2, 3],
        selected: [],
        notice: "",
      };
    if (s.phase !== "playing") return s;
    if (a.type === "undo")
      return { ...s, selected: s.selected.slice(0, -1), notice: "" };
    if (a.type === "cell") {
      if (
        !Number.isInteger(a.index) ||
        a.index < 0 ||
        a.index >= 16 ||
        s.found.some((g) => p.groups[g].words.includes(p.items[a.index]))
      )
        return s;
      return {
        ...s,
        selected: s.selected.includes(a.index)
          ? s.selected.filter((i) => i !== a.index)
          : s.selected.length < 4
            ? [...s.selected, a.index]
            : s.selected,
        notice: "",
      };
    }
    if (a.type !== "check" || s.selected.length !== 4) return s;
    const guess = [...s.selected].sort((a, b) => a - b).map(String);
    if (s.history.some((prior) => prior.join(",") === guess.join(",")))
      return { ...s, notice: "You already tried that group." };
    const group = p.groups.findIndex((g) =>
      s.selected.every((i) => g.words.includes(p.items[i])),
    );
    const history = [...s.history, guess];
    if (group >= 0) {
      const found = [...s.found, group];
      return {
        ...s,
        found,
        history,
        selected: [],
        notice: "",
        phase: found.length === 4 ? "solved" : "playing",
      };
    }
    const mistakes = s.mistakes + 1;
    const near = p.groups.some(
      (g) =>
        s.selected.filter((i) => g.words.includes(p.items[i])).length === 3,
    );
    return {
      ...s,
      history,
      mistakes,
      notice: near ? "One away." : "Those words do not form a group.",
      phase: mistakes >= 4 ? "failed" : "playing",
    };
  }
  if (p.kind === "crossword") {
    if (a.type === "reveal")
      return {
        ...s,
        phase: s.phase === "solved" ? "solved" : "revealed",
        values: [...p.solution],
        notice: "",
      };
    if (s.phase !== "playing") return s;
    if (a.type === "undo") {
      const prior = s.history.at(-1);
      return prior
        ? { ...s, values: prior, history: s.history.slice(0, -1), notice: "" }
        : s;
    }
    if (a.type === "check") {
      const wrong = s.values.filter((v, i) => v !== p.solution[i]).length;
      return {
        ...s,
        notice: `${wrong} ${wrong === 1 ? "square needs" : "squares need"} another look.`,
      };
    }
    if (
      a.type !== "input" ||
      !Number.isInteger(a.index) ||
      a.index < 0 ||
      a.index >= 25 ||
      p.solution[a.index] === "#" ||
      !/^([a-zA-Z]?)$/.test(a.value)
    )
      return s;
    const values = [...s.values];
    values[a.index] = a.value.toUpperCase();
    if (values[a.index] === s.values[a.index]) return s;
    return {
      ...s,
      values,
      history: [...s.history, s.values].slice(-200),
      moves: s.moves + 1,
      notice: "",
      phase: values.every((v, i) => v === p.solution[i]) ? "solved" : "playing",
    };
  }
  if (p.kind === "wordgrid") {
    if (a.type === "reveal" && s.phase !== "solved")
      return {
        ...s,
        phase: "revealed",
        values: [...p.solution],
        selected: [],
        notice: "",
      };
    if (s.phase !== "playing") return s;
    if (a.type === "undo") {
      const prior = s.history.at(-1);
      return prior
        ? {
            ...s,
            values: prior,
            history: s.history.slice(0, -1),
            moves: Math.max(0, s.moves - 1),
            selected: [],
            notice: "",
          }
        : s;
    }
    if (
      a.type !== "cell" ||
      !Number.isInteger(a.index) ||
      a.index < 0 ||
      a.index >= 25 ||
      s.values[a.index] === "#" ||
      s.values[a.index] === p.solution[a.index]
    )
      return s;
    if (s.selected.length === 0) return { ...s, selected: [a.index] };
    const from = s.selected[0];
    if (from === a.index) return { ...s, selected: [] };
    const values = [...s.values];
    [values[from], values[a.index]] = [values[a.index], values[from]];
    const moves = s.moves + 1;
    return {
      ...s,
      values,
      moves,
      selected: [],
      history: [...s.history, s.values],
      phase: values.every((v, i) => v === p.solution[i])
        ? "solved"
        : moves >= p.maxMoves
          ? "failed"
          : "playing",
    };
  }
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
  if (p.kind === "groups") {
    if (!Array.isArray(saved.history) || saved.history.length > 8) return blank;
    let restored = blank;
    for (const guess of saved.history) {
      if (
        !Array.isArray(guess) ||
        guess.length !== 4 ||
        new Set(guess).size !== 4 ||
        !guess.every(
          (v) => typeof v === "string" && /^(?:[0-9]|1[0-5])$/.test(v),
        )
      )
        return blank;
      restored = { ...restored, selected: [] };
      for (const v of guess)
        restored = stepBoard(p, restored, { type: "cell", index: Number(v) });
      restored = stepBoard(p, restored, { type: "check" });
    }
    if (saved.phase === "revealed")
      return stepBoard(p, restored, { type: "reveal" });
    if (
      restored.phase === "playing" &&
      Array.isArray(saved.selected) &&
      saved.selected.length <= 4
    )
      for (const i of saved.selected)
        if (typeof i === "number")
          restored = stepBoard(p, restored, { type: "cell", index: i });
    return restored;
  }

  if (p.kind === "crossword") {
    const valid = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.length === 25 &&
      v.every((c, i) =>
        p.solution[i] === "#"
          ? c === "#"
          : typeof c === "string" && /^[A-Z]?$/.test(c),
      );
    if (!valid(saved.values)) return blank;
    if (saved.phase === "revealed")
      return stepBoard(p, blank, { type: "reveal" });
    return {
      ...blank,
      values: saved.values,
      phase: saved.values.every((v, i) => v === p.solution[i])
        ? "solved"
        : "playing",
      history: Array.isArray(saved.history)
        ? saved.history.filter(valid).slice(-200)
        : [],
    };
  }

  if (p.kind === "wordgrid") {
    const valid = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.length === 25 &&
      v.every(
        (c, i) =>
          typeof c === "string" &&
          (p.solution[i] === "#" ? c === "#" : /^[A-Z]$/.test(c)),
      ) &&
      [...v].sort().join("") === [...p.initial].sort().join("");
    if (
      !valid(saved.values) ||
      !Number.isInteger(saved.moves) ||
      saved.moves! < 0 ||
      saved.moves! > p.maxMoves
    )
      return blank;
    if (saved.phase === "revealed")
      return stepBoard(p, blank, { type: "reveal" });
    const values = saved.values;
    const phase = values.every((v, i) => v === p.solution[i])
      ? "solved"
      : saved.moves === p.maxMoves
        ? "failed"
        : "playing";
    return {
      ...blank,
      values,
      moves: saved.moves!,
      phase,
      history: Array.isArray(saved.history)
        ? saved.history.filter(valid).slice(-15)
        : [],
    };
  }
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
