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
  reportDaily,
  waitForFeedActivation,
  startPractice,
} from "../daily/bridge.js";
import "./help.js";
const game = document.body.dataset.game as BoardGame;
const info = boardGames.find((x) => x.id === game)!;
const quiz = required("#quiz");
let day = dailyDate(),
  mode: "daily" | "practice" = startPractice ? "practice" : "daily";
let seed = day,
  puzzle = makeBoard(game, seed),
  state: BoardState = initialBoard(puzzle);
let dragging = false;
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
}
function save() {
  try {
    localStorage.setItem(slot(), JSON.stringify({ seed, state }));
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
function drawBoard() {
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
          ? "Crown"
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
      b.append(el("span", region, "puzzle-region"));
      b.setAttribute(
        "aria-label",
        `Row ${Math.floor(i / puzzle.size) + 1}, column ${(i % puzzle.size) + 1}, region ${region}, ${state.values[i] === "C" ? "Crown" : state.values[i] === "x" ? "No crown" : "empty"}`,
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
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = puzzle.kind === "path";
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
      ? puzzle.kind === "crowns"
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
        puzzle.kind === "crowns"
          ? `${state.values.filter((v) => v === "C").length} of 6 crowns`
          : `${state.selected.length} of ${puzzle.size * puzzle.size} squares`,
        "puzzle-progress",
      ),
    );
  content.push(drawBoard());
  if (state.notice) {
    const note = el("p", state.notice, "rot-feedback");
    note.setAttribute("role", "status");
    content.push(note);
  }
  const actions = el("div", undefined, "rot-actions");
  if (state.phase === "playing") {
    const undo = button("Undo", () => act({ type: "undo" }));
    undo.disabled =
      puzzle.kind === "path"
        ? state.selected.length === 0
        : state.history.length === 0;
    actions.append(undo);
    const reset = button("Restart", () => act({ type: "reset" }));
    reset.disabled =
      puzzle.kind === "path"
        ? state.selected.length === 0
        : !state.values.some(Boolean);
    actions.append(reset);
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
  mode = next;
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
quiz.addEventListener("pointermove", (e) => {
  if (!dragging || state.phase !== "playing") return;
  const target = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest<HTMLElement>("[data-cell]");
  if (target && quiz.contains(target))
    act({ type: "cell", index: Number(target.dataset.cell) });
});
window.addEventListener("pointerup", () => {
  dragging = false;
});
window.addEventListener("pointercancel", () => {
  dragging = false;
});
window.addEventListener("blur", () => {
  dragging = false;
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
