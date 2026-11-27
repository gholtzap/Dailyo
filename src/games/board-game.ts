import { required, element as el } from "../dom.js";
import { boardGames, type BoardGame } from "./board-catalog.js";
import {
  makeBoard,
  initialBoard,
  restoreBoard,
  stepBoard,
  type BoardState,
  type BoardAction,
} from "./board-state.js";
import {
  dailyDate,
  inFeed,
  reportDaily,
  waitForFeedActivation,
  startPractice,
} from "../daily/bridge.js";
import "./help.js";
const game = document.body.dataset.game as BoardGame;
const info = boardGames.find((x) => x.id === game)!;
const quiz = required("#quiz");
const modeKey = `dailyo:${game}:v1:mode`;
function rememberedMode() {
  try {
    return localStorage.getItem(modeKey) === "practice";
  } catch {
    return false;
  }
}

let day = dailyDate(),
  mode: "daily" | "practice" =
    startPractice || (!inFeed && rememberedMode()) ? "practice" : "daily";
let seed = day,
  puzzle = makeBoard(game, seed),
  state: BoardState = initialBoard(puzzle);
let gesture: { state: "idle" } | { state: "drawing"; pointer: number } = {
  state: "idle",
};
const slot = (m = mode) =>
  `dailyo:${game}:v1:${m === "daily" ? `daily:${day}` : "practice"}`;
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(slot()) ?? "null");
  } catch {
    return null;
  }
};
function load() {
  const raw = read();
  seed =
    mode === "daily"
      ? day
      : typeof raw?.seed === "string" &&
          /^practice:[\w-]{1,100}$/.test(raw.seed)
        ? raw.seed
        : `practice:${crypto.randomUUID()}`;
  puzzle = makeBoard(game, seed);
  state = restoreBoard(puzzle, raw?.state);
  save();
}
function save() {
  try {
    const saved = state.phase === "playing" ? state : { ...state, history: [] };
    localStorage.setItem(slot(), JSON.stringify({ seed, state: saved }));
  } catch {}
}
function result() {
  return state.phase === "solved"
    ? "Solved"
    : state.phase === "failed"
      ? "Not solved"
      : "Answer shown";
}
function act(action: BoardAction) {
  const next = stepBoard(puzzle, state, action);
  if (next === state) return;
  state = next;
  save();
  draw();
}
function button(label: string, action: () => void, kind = "secondary") {
  const b = el("button", label, kind);
  b.type = "button";
  b.onclick = action;
  return b;
}
function drawSudoku() {
  if (puzzle.kind !== "sudoku") throw new Error("Wrong board");
  const current = puzzle;
  const grid = el("div", undefined, "puzzle-grid columns-6 sudoku-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Mini Sudoku board");
  current.initial.forEach((given, i) => {
    const square = el("div", undefined, "puzzle-entry");
    const input = el("input", undefined, "puzzle-input");
    input.type = "text";
    input.inputMode = "numeric";
    input.pattern = "[1-6]";
    input.maxLength = 1;
    input.autocomplete = "off";
    input.dataset.cell = String(i);
    input.value = state.values[i];
    input.readOnly = Boolean(given) || state.phase !== "playing";
    input.setAttribute(
      "aria-label",
      `Row ${Math.floor(i / 6) + 1}, column ${(i % 6) + 1}${given ? ", given" : ""}`,
    );
    input.classList.toggle("is-given", Boolean(given));
    input.classList.toggle("box-right", i % 6 === 2);
    input.classList.toggle("box-bottom", Math.floor(i / 6) % 2 === 1 && i < 30);
    input.oninput = () => {
      const value = input.value.slice(-1);
      if (!/^[1-6]?$/.test(value)) {
        input.value = state.values[i];
        return;
      }
      act({ type: "input", index: i, value });
    };
    square.append(input);
    grid.append(square);
  });
  return grid;
}
function drawGroups() {
  if (puzzle.kind !== "groups") throw new Error("Wrong board");
  const section = el("div");
  for (const id of state.found) {
    const group = puzzle.groups[id];
    const solved = el("div", undefined, "puzzle-found");
    solved.append(el("h3", group.name), el("p", group.words.join(" · ")));
    section.append(solved);
  }
  const grid = el("div", undefined, "puzzle-grid columns-4 groups-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Groups board");
  puzzle.items.forEach((word, i) => {
    if (
      puzzle.kind !== "groups" ||
      state.found.some(
        (g) =>
          puzzle.kind === "groups" && puzzle.groups[g].words.includes(word),
      )
    )
      return;
    const b = button(
      word[0] + word.slice(1).toLowerCase(),
      () => act({ type: "cell", index: i }),
      "puzzle-cell group-word",
    );
    b.dataset.cell = String(i);
    b.setAttribute("aria-pressed", String(state.selected.includes(i)));
    b.classList.toggle("is-picked", state.selected.includes(i));
    b.disabled = state.phase !== "playing";
    grid.append(b);
  });
  section.append(grid);
  return section;
}
let entryDirection: "Across" | "Down" = "Across";
function drawCrossword() {
  if (puzzle.kind !== "crossword") throw new Error("Wrong board");
  const current = puzzle;
  const grid = el("div", undefined, "puzzle-grid columns-5 crossword-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Mini crossword board");
  current.solution.forEach((target, i) => {
    if (target === "#") {
      grid.append(el("div", undefined, "puzzle-block"));
      return;
    }
    const square = el("div", undefined, "puzzle-entry");
    const input = el("input", undefined, "puzzle-input");
    input.type = "text";
    input.maxLength = 1;
    input.autocomplete = "off";
    input.autocapitalize = "characters";
    input.spellcheck = false;
    input.dataset.cell = String(i);
    input.value = state.values[i];
    input.readOnly = state.phase !== "playing";
    input.setAttribute(
      "aria-label",
      `Row ${Math.floor(i / 5) + 1}, column ${(i % 5) + 1}`,
    );
    input.oninput = () => {
      const value = input.value.slice(-1);
      if (!/^[a-zA-Z]?$/.test(value)) {
        input.value = state.values[i];
        return;
      }
      act({ type: "input", index: i, value });
      if (value) {
        const clue =
          puzzle.kind === "crossword"
            ? puzzle.clues.find(
                (c) => c.direction === entryDirection && c.cells.includes(i),
              )
            : undefined;
        const next = clue?.cells[clue.cells.indexOf(i) + 1];
        if (next !== undefined)
          quiz.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus();
      }
    };
    square.append(input);
    if (current.numbers[i])
      square.append(el("span", String(current.numbers[i]), "puzzle-number"));
    grid.append(square);
  });
  return grid;
}
function crosswordClues() {
  const section = el("div", undefined, "puzzle-clues");
  if (puzzle.kind !== "crossword") return section;
  for (const direction of ["Across", "Down"] as const) {
    const group = el("div");
    group.append(el("h3", direction));
    for (const clue of puzzle.clues.filter((c) => c.direction === direction))
      group.append(
        button(
          `${clue.number}. ${clue.text}`,
          () => {
            entryDirection = direction;
            quiz
              .querySelector<HTMLElement>(`[data-cell="${clue.cells[0]}"]`)
              ?.focus();
          },
          "puzzle-clue",
        ),
      );
    section.append(group);
  }
  return section;
}
function drawWordGrid() {
  if (puzzle.kind !== "wordgrid") throw new Error("Wrong board");
  const grid = el("div", undefined, "puzzle-grid columns-5 word-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Word grid board");
  puzzle.solution.forEach((target, i) => {
    if (target === "#") {
      const blank = el("div", undefined, "puzzle-block");
      blank.setAttribute("aria-hidden", "true");
      grid.append(blank);
      return;
    }
    const value = state.values[i];
    const b = button(
      value,
      () => act({ type: "cell", index: i }),
      "puzzle-cell",
    );
    b.dataset.cell = String(i);
    b.dataset.value = value;
    b.classList.toggle("letter-right", value === target);
    b.classList.toggle("is-picked", state.selected.includes(i));
    b.disabled = state.phase !== "playing" || value === target;
    b.setAttribute(
      "aria-label",
      `${value}, row ${Math.floor(i / 5) + 1}, column ${(i % 5) + 1}${value === target ? ", correct position" : ""}`,
    );
    grid.append(b);
  });
  return grid;
}
function drawBoard() {
  if (puzzle.kind === "sudoku") return drawSudoku();
  if (puzzle.kind === "groups") return drawGroups();
  if (puzzle.kind === "crossword") return drawCrossword();
  if (puzzle.kind === "wordgrid") return drawWordGrid();
  const grid = el(
    "div",
    undefined,
    `puzzle-grid columns-${puzzle.size} ${puzzle.kind}-grid`,
  );
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", `${info.name} board`);
  for (let i = 0; i < puzzle.size * puzzle.size; i++) {
    const checkpoint =
      puzzle.kind === "path" ? puzzle.checkpoints.indexOf(i) : -1;
    const position =
      puzzle.kind === "path"
        ? state.selected.indexOf(i)
        : state.values[i] === "C"
          ? 0
          : -1;
    const b = button(
      puzzle.kind === "crowns"
        ? state.values[i] === "C"
          ? "C"
          : state.values[i] === "x"
            ? "No"
            : ""
        : checkpoint >= 0
          ? String(checkpoint + 1)
          : "",
      () => {},
      "puzzle-cell",
    );
    b.dataset.cell = String(i);
    b.classList.toggle("is-picked", position >= 0);
    b.classList.toggle(
      "is-tail",
      puzzle.kind === "path" &&
        position === state.selected.length - 1 &&
        position >= 0,
    );
    const previous =
      puzzle.kind === "path" && position > 0
        ? state.selected[position - 1]
        : undefined;
    const next =
      puzzle.kind === "path" && position >= 0
        ? state.selected[position + 1]
        : undefined;
    for (const neighbor of [previous, next])
      if (neighbor !== undefined) {
        const delta = neighbor - i;
        b.classList.add(
          delta === 1
            ? "connect-right"
            : delta === -1
              ? "connect-left"
              : delta === puzzle.size
                ? "connect-down"
                : "connect-up",
        );
      }
    b.classList.toggle("is-checkpoint", checkpoint >= 0);
    b.setAttribute(
      "aria-label",
      `Row ${Math.floor(i / puzzle.size) + 1}, column ${(i % puzzle.size) + 1}${checkpoint >= 0 ? `, checkpoint ${checkpoint + 1}` : ""}${position >= 0 ? `, path step ${position + 1}` : ""}`,
    );
    if (puzzle.kind === "crowns") {
      const region = String.fromCharCode(65 + puzzle.regions[i]);
      b.classList.add(`region-${puzzle.regions[i]}`);
      b.append(" ", el("span", region, "puzzle-region"));
      b.setAttribute(
        "aria-label",
        `${state.values[i] === "C" ? "C " : state.values[i] === "x" ? "No " : ""}${region}, row ${Math.floor(i / puzzle.size) + 1}, column ${(i % puzzle.size) + 1}, region ${region}, ${state.values[i] === "C" ? "Crown" : state.values[i] === "x" ? "No crown" : "empty"}`,
      );
    }
    const tip = el("span", b.getAttribute("aria-label")!, "puzzle-tooltip");
    tip.id = `cell-tip-${i}`;
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    b.setAttribute("aria-describedby", tip.id);
    b.append(tip);
    b.setAttribute("aria-pressed", String(position >= 0));
    b.disabled = state.phase !== "playing";
    b.onclick = (e) => {
      if ((e as PointerEvent).detail === 0) act({ type: "cell", index: i });
    };
    b.onpointerdown = (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      gesture =
        puzzle.kind === "path"
          ? { state: "drawing", pointer: e.pointerId }
          : { state: "idle" };
      act({ type: "cell", index: i });
    };
    grid.append(b);
  }
  return grid;
}
function draw() {
  const focus = (document.activeElement as HTMLElement)?.dataset.cell;
  document
    .querySelectorAll<HTMLButtonElement>(".modes button")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.id === mode)));
  const title = el(
    "h2",
    state.phase === "playing"
      ? puzzle.kind === "sudoku"
        ? "Fill the grid"
        : puzzle.kind === "groups"
          ? "Find four groups of four"
          : puzzle.kind === "crossword"
            ? "Solve the crossword"
            : puzzle.kind === "wordgrid"
              ? "Complete six words"
              : puzzle.kind === "crowns"
                ? "Place six crowns"
                : "Connect the checkpoints"
      : result(),
  );
  title.id = "puzzle-title";
  title.tabIndex = -1;
  const content: HTMLElement[] = [title];
  if (state.phase === "playing")
    content.push(
      el(
        "p",
        puzzle.kind === "sudoku"
          ? `${state.values.filter(Boolean).length} of 36 squares`
          : puzzle.kind === "groups"
            ? `${4 - state.mistakes} mistakes left`
            : puzzle.kind === "crossword"
              ? `${state.values.filter((v) => v && v !== "#").length} of 21 letters`
              : puzzle.kind === "wordgrid"
                ? `${puzzle.maxMoves - state.moves} swaps left`
                : puzzle.kind === "crowns"
                  ? `${state.values.filter((v) => v === "C").length} of 6 crowns`
                  : `${state.selected.length} of ${puzzle.size * puzzle.size} squares`,
        "puzzle-progress",
      ),
    );
  content.push(drawBoard());
  if (puzzle.kind === "crossword") content.push(crosswordClues());
  if (state.notice) {
    const note = el("p", state.notice, "rot-feedback");
    note.setAttribute("role", "status");
    content.push(note);
  }
  const actions = el("div", undefined, "rot-actions");
  if (state.phase === "playing") {
    if (puzzle.kind === "groups") {
      const submit = button(
        "Submit group",
        () => act({ type: "check" }),
        "primary",
      );
      submit.disabled = state.selected.length !== 4;
      actions.append(submit);
    }
    const undo = button("Undo", () => act({ type: "undo" }));
    undo.disabled =
      puzzle.kind === "path" || puzzle.kind === "groups"
        ? state.selected.length === 0
        : state.history.length === 0;
    actions.append(undo);
    if (puzzle.kind === "crossword" || puzzle.kind === "sudoku")
      actions.append(button("Check answers", () => act({ type: "check" })));
    const reset = button("Restart", () => act({ type: "reset" }));
    reset.disabled =
      puzzle.kind === "path" || puzzle.kind === "groups"
        ? state.selected.length === 0
        : !state.values.some(Boolean);
    if (puzzle.kind !== "groups") actions.append(reset);
    const answer = el("details", undefined, "puzzle-assistance");
    answer.append(
      el("summary", "Help with this puzzle"),
      button("Show answer", () => act({ type: "reveal" })),
    );
    content.push(actions, answer);
  } else {
    if (mode === "daily")
      actions.append(
        button("Play practice", () => selectMode("practice"), "primary"),
      );
    else actions.append(button("New puzzle", newPuzzle, "primary"));
    actions.append(button("Copy results", copyResults));
    if (state.phase === "failed")
      actions.append(button("Show answer", () => act({ type: "reveal" })));
    content.push(actions);
  }
  quiz.replaceChildren(...content);
  if (focus && state.phase === "playing")
    quiz
      .querySelector<HTMLElement>(`[data-cell="${focus}"]`)
      ?.focus({ preventScroll: true });
  reportDaily(
    state.phase === "playing" ? "playing" : "complete",
    state.phase === "playing" ? undefined : result(),
    day,
  );
}
function selectMode(next: "daily" | "practice") {
  gesture = { state: "idle" };
  mode = next;
  if (!inFeed)
    try {
      localStorage.setItem(modeKey, mode);
    } catch {}
  load();
  draw();
}
function newPuzzle() {
  try {
    localStorage.removeItem(slot());
  } catch {}
  load();
  save();
  draw();
}
async function copyResults() {
  const text = `dailyo · ${info.name} · ${mode === "daily" ? day : "Practice"}\n${result()}\n\nhttps://trainrot.vercel.app/${game}/`;
  try {
    await navigator.clipboard.writeText(text);
    const note = el("p", "Copied", "rot-feedback");
    note.setAttribute("role", "status");
    quiz.append(note);
  } catch {
    const field = el("textarea");
    field.setAttribute("aria-label", "Results to copy");
    field.readOnly = true;
    field.value = text;
    quiz.append(field);
    field.focus();
    field.select();
  }
}
window.addEventListener("pointermove", (e) => {
  if (
    gesture.state !== "drawing" ||
    e.pointerId !== gesture.pointer ||
    state.phase !== "playing"
  )
    return;
  const target = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest<HTMLElement>("[data-cell]");
  if (target && quiz.contains(target))
    act({ type: "cell", index: Number(target.dataset.cell) });
});
window.addEventListener("pointerup", () => {
  gesture = { state: "idle" };
});
window.addEventListener("pointercancel", () => {
  gesture = { state: "idle" };
});
window.addEventListener("blur", () => {
  gesture = { state: "idle" };
});
quiz.addEventListener("keydown", (e) => {
  const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
  if (!cell) return;
  const i = Number(cell.dataset.cell);
  const delta = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: puzzle.size,
    ArrowUp: -puzzle.size,
  }[e.key];
  if (delta !== undefined) {
    e.preventDefault();
    const n = i + delta;
    if (
      n >= 0 &&
      n < puzzle.size * puzzle.size &&
      (Math.abs(delta) !== 1 ||
        Math.floor(n / puzzle.size) === Math.floor(i / puzzle.size))
    )
      quiz.querySelector<HTMLElement>(`[data-cell="${n}"]`)?.focus();
  }
  if (e.key === "Backspace" && e.target instanceof HTMLInputElement) {
    e.preventDefault();
    act({ type: "input", index: i, value: "" });
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    act({ type: "undo" });
  }
});
function changeDay() {
  const next = dailyDate();
  if (next === day) return;
  day = next;
  if (mode === "daily") {
    load();
    draw();
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) changeDay();
});
setInterval(changeDay, 30000);
await waitForFeedActivation();
load();
draw();
required("#daily").onclick = () => selectMode("daily");
required("#practice").onclick = () => selectMode("practice");
