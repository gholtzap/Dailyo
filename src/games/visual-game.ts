import { loadDataset } from "../data.js";
import { priceControl } from "./price-control.js";
import { gameName } from "../game-names.js";
import type { JsonValue, Mode } from "../types.js";
import { showGameProgress } from "./help.js";
import {
  dailyDate,
  inFeed,
  reportDaily,
  waitForFeedActivation,
  rushRound,
  reportRush,
  onRushTimeout,
  rushSeed,
  startPractice,
  readRushDraft,
  saveRushDraft,
  rushFeedback,
} from "../daily/bridge.js";
import { showRank } from "../daily/rank.js";
import {
  parseDifficulty,
  practiceSettings,
  practiceSlot,
} from "./difficulty.js";
import type { PracticeDifficulty } from "./difficulty.js";
import {
  isVisualGame,
  visualSet,
  visualPuzzle,
  emptyAnswer,
  validAnswer,
  answered,
  answerPoints,
  gradeVisual,
  priceError,
  rushCorrect,
  photoScale,
  photoPoints,
} from "./visual-puzzles.js";
import type {
  VisualGame,
  VisualItem,
  VisualQuestion,
  VisualAnswer,
} from "./visual-puzzles.js";

const gameId = document.body.dataset.game ?? "";
if (!isVisualGame(gameId)) throw new Error("Unknown game");
const game: VisualGame = gameId;
const quiz = document.querySelector<HTMLElement>("#quiz")!;
const controls = [
  ...document.querySelectorAll<HTMLButtonElement>(".modes button"),
];
const photoGame = game !== "orderrot" && game !== "pricerot";
const isRush = rushRound !== null;
const storageKey = (slot: string) => `dailyo:${game}:v1:${slot}`;
function read(slot: string): JsonValue {
  try {
    return JSON.parse(
      localStorage.getItem(storageKey(slot)) ?? "null",
    ) as JsonValue;
  } catch {
    return null;
  }
}
function write(
  slot: string,
  value: { seed: string; answers: VisualAnswer[] } | Mode | PracticeDifficulty,
) {
  try {
    localStorage.setItem(storageKey(slot), JSON.stringify(value));
  } catch {}
}
const freshSeed = () => `practice:${crypto.randomUUID()}`;
interface Session {
  seed: string;
  questions: VisualQuestion[];
  answers: VisualAnswer[];
  index: number;
}
let rows: VisualItem[] = [];
let day = dailyDate();
let mode: "daily" | "practice" =
  startPractice || (!inFeed && read("mode") === "practice")
    ? "practice"
    : "daily";
const sessions = {} as Record<"daily" | "practice", Session>;
let loadPractice: () => Session;
let draft: string[] = [];
let imageFailed = false;
let focusNext = false;
let renderedQuestion: VisualQuestion | undefined;
let difficulty = parseDifficulty(read("difficulty"));
let settings: ReturnType<typeof practiceSettings> | undefined;
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function button(text: string, callback: () => void, className = "secondary") {
  const node = el("button", text, className);
  node.type = "button";
  node.onclick = callback;
  return node;
}
function mount(
  seed: string,
  saved?: JsonValue,
  level: PracticeDifficulty = "standard",
): Session {
  const questions = visualSet(game, rows, seed, isRush, rushRound ?? 0, level);
  const session: Session = {
    seed,
    questions,
    answers: questions.map(emptyAnswer),
    index: 0,
  };
  if (saved && typeof saved === "object") {
    const candidate = saved as Partial<Session>;
    if (
      candidate.seed === seed &&
      Array.isArray(candidate.answers) &&
      candidate.answers.length === questions.length &&
      candidate.answers.every((a, i) => validAnswer(game, questions[i]!, a))
    ) {
      const answers = candidate.answers;
      let first = answers.findIndex(
        (a, i) => !answered(game, questions[i]!, a),
      );
      if (first < 0) first = questions.length;
      // Saved progress must be a consecutive prefix followed by at most one partial answer.
      if (
        answers
          .slice(first + 1)
          .every((a) => JSON.stringify(a) === JSON.stringify(emptyAnswer()))
      ) {
        session.answers = answers;
        session.index = first;
      }
    }
  }
  return session;
}
function save() {
  if (!isRush)
    write(mode === "daily" ? `daily:${day}` : practiceSlot(difficulty), {
      seed: sessions[mode].seed,
      answers: sessions[mode].answers,
    });
}
function resetDay() {
  if (isRush || dailyDate() === day) return false;
  day = dailyDate();
  sessions.daily = mount(day, read(`daily:${day}`));
  draft = [];
  imageFailed = false;
  return true;
}
function selectMode(next: "daily" | "practice") {
  if (next === "practice") sessions.practice ??= loadPractice();
  mode = next;
  resetDay();
  write("mode", mode);
  draft = [];
  imageFailed = false;
  draw();
}
function current() {
  const s = sessions[mode];
  return { s, q: s.questions[s.index]!, a: s.answers[s.index]! };
}
function commit(answer: VisualAnswer) {
  if (resetDay() && mode === "daily") {
    draw();
    return;
  }
  const { s, q, a } = current();
  if (!q || answered(game, q, a) || !validAnswer(game, q, answer)) return;
  // Keep this question's footprint when feedback replaces its answer controls.
  // Releasing it belongs to the next question or a mode/difficulty change.
  quiz.style.minHeight = `${Math.ceil(quiz.getBoundingClientRect().height)}px`;
  s.answers[s.index] = answer;
  save();
  draw();
  quiz
    .querySelector<HTMLElement>("#visual-feedback")
    ?.focus({ preventScroll: true });
  if (answered(game, q, answer) && isRush)
    reportRush("answered", rushCorrect(game, q, answer));
}
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
function source(item: VisualItem) {
  if (game === "pricerot") {
    const details = el("details", undefined, "visual-source");
    const link = el("a", item.retailer);
    link.href = item.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const date = el("time", item.captured);
    date.dateTime = item.captured!;
    date.title = "Price recorded";
    details.append(el("summary", "Source"), link, el("span", " · "), date);
    if (item.imageSource?.startsWith("https://")) {
      const photo = el("a", "Product photo");
      photo.href = item.imageSourcePage ?? item.imageSource;
      photo.target = "_blank";
      photo.rel = "noopener noreferrer";
      details.append(el("br"), photo);
      if (item.imageSourcePage && item.credit)
        details.append(el("p", item.credit.replace(/^Price: [^;]+; /, "")));
    }
    return details;
  }
  const details = el("details", undefined, "visual-source");
  details.append(el("summary", "Source"));
  const link = el(
    "a",
    item.credit
      ? `${item.credit} · ${item.license ?? "Source"}`
      : new URL(item.source).hostname.replace(/^www\./, ""),
  );
  link.href = item.source;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  details.append(link);
  if (item.imageSource?.startsWith("https://")) {
    const photo = el("a", "Product photo");
    photo.href = item.imageSourcePage ?? item.imageSource;
    photo.target = "_blank";
    photo.rel = "noopener noreferrer";
    details.append(el("span", " · "), photo);
  }
  if (item.licenseUrl?.startsWith("https://")) {
    const license = el("a", "License terms");
    license.href = item.licenseUrl;
    license.target = "_blank";
    license.rel = "noopener noreferrer";
    details.append(el("span", " · "), license);
  }
  return details;
}
function media(q: VisualQuestion, a: VisualAnswer, complete: boolean) {
  const figure = el("figure", undefined, "visual-figure");
  const viewport = el("div", undefined, "visual-viewport");
  const image = el("img");
  image.src = q.item.image!;
  // Alt text describes the task without disclosing the answer before submission.
  image.alt = complete
    ? q.item.name
    : game === "skyrot"
      ? "Overhead photograph of the mystery city"
      : game === "skylinerot"
        ? "Skyline photograph of the mystery city"
        : game === "pricerot"
          ? q.item.name
          : "Cropped photograph of the mystery object";
  image.draggable = false;
  const levelDifficulty =
    mode === "practice" && !isRush ? difficulty : "standard";
  const focus =
    levelDifficulty === "hard"
      ? (q.item.detailFocus ?? q.item.focus)
      : q.item.focus;
  if (focus) image.style.transformOrigin = `${focus[0]}% ${focus[1]}%`;
  const level = complete ? 2 : a.hint;
  if (photoGame) {
    viewport.dataset.zoom = String(level);
    image.style.transform = `scale(${photoScale(game, levelDifficulty, level)})`;
  }
  viewport.dataset.kind = game;
  image.onerror = () => {
    imageFailed = true;
    if (game === "pricerot") {
      quiz.replaceChildren(
        el("p", "The product image could not load."),
        button("Reload puzzle", () => location.reload()),
      );
      if (isRush) reportRush("error");
      else reportDaily("error");
      return;
    }
    viewport.replaceChildren(el("div", undefined, "visual-image-error"));
    viewport.firstElementChild!.append(
      el("p", "The image could not load. Reload this puzzle to try again."),
      button("Reload puzzle", () => location.reload()),
    );
    for (const node of quiz.querySelectorAll<HTMLButtonElement>(
      ".visual-choice, .visual-hint",
    ))
      node.disabled = true;
    if (isRush) reportRush("error");
    else reportDaily("error");
  };
  viewport.append(image);
  figure.append(viewport);
  if (complete && photoGame) figure.append(el("figcaption", q.item.name));
  else if (
    photoGame &&
    !isRush &&
    (game !== "skylinerot" || levelDifficulty === "hard")
  )
    figure.append(
      el(
        "figcaption",
        `View ${a.hint + 1} of 3 · ${photoPoints(Math.max(a.hint, a.guesses.length))} points available`,
      ),
    );
  return figure;
}
function formatOrderValue(value: number, unit?: string) {
  const precision =
    value !== 0 && Math.abs(value) < 0.001
      ? { maximumSignificantDigits: 3 }
      : { maximumFractionDigits: 3 };
  return value.toLocaleString("en-US", {
    ...precision,
    useGrouping: unit !== "CE",
  });
}
function reveal(q: VisualQuestion, a: VisualAnswer, review = false) {
  const content = el("div", undefined, "visual-reveal");
  const points = answerPoints(game, q, a);
  if (!review) {
    const feedback = el(
      "h3",
      isRush
        ? rushFeedback(rushCorrect(game, q, a))
        : a.skipped
          ? "Answer revealed"
          : `${points} / 100 points`,
    );
    feedback.id = "visual-feedback";
    feedback.tabIndex = -1;
    const status = el("div");
    status.setAttribute("role", "status");
    status.append(feedback);
    content.append(status);
  }
  if (game === "pricerot") {
    const comparison = el("dl", undefined, "price-comparison");
    const actual = el("div");
    actual.append(
      el("dt", "Price"),
      el("dd", money(q.item.cents!), "price-actual"),
    );
    comparison.append(actual);
    if (a.price !== null) {
      const guess = el("div");
      const error = Math.round(priceError(a.price, q.item.cents!) * 100);
      guess.append(
        el("dt", "Your guess"),
        el("dd", money(a.price)),
        el(
          "dd",
          a.price === q.item.cents
            ? "Exact"
            : `${error}% ${a.price < q.item.cents! ? "low" : "high"}`,
          "price-error",
        ),
      );
      comparison.append(guess);
    }
    content.append(comparison);
  } else if (game === "orderrot") {
    const comparison = el("div", undefined, "visual-order-comparison");
    if (a.order.length) {
      const submitted = el("div"),
        list = el("ol", undefined, "visual-submitted");
      list.setAttribute("aria-label", "Your order");
      for (const id of a.order)
        list.append(el("li", q.tiles.find((item) => item.id === id)!.name));
      submitted.append(el("h3", "Your order"), list);
      comparison.append(submitted);
    }
    const correct = el("div");
    const list = el("ol", undefined, "visual-solution");
    list.setAttribute("aria-label", "Correct order");
    for (const item of [...q.tiles].sort((x, y) => x.value - y.value)) {
      const value = `${formatOrderValue(item.value, q.item.unit)}${q.item.unit ? ` ${q.item.unit}` : ""}`;
      const numeric = item.name.match(/^([\d.,]+)\s+(.+)$/);
      const sameValue =
        numeric &&
        Number(numeric[1].replaceAll(",", "")) === item.value &&
        numeric[2] === q.item.unit;
      list.append(el("li", sameValue ? item.name : `${item.name} — ${value}`));
    }
    correct.append(el("h3", "Correct order"), list);
    comparison.append(correct);
    content.append(comparison);
  } else {
    if (review) {
      const image = el("img", undefined, "review-photo");
      image.src = q.item.image!;
      image.alt = q.item.name;
      image.loading = "lazy";
      image.onerror = () =>
        image.replaceWith(el("p", "The photograph could not load."));
      const guesses = a.guesses
        .map((id) => q.options.find((option) => option.id === id)?.name)
        .filter(Boolean);
      content.append(
        image,
        el(
          "p",
          guesses.length
            ? `Your ${guesses.length === 1 ? "guess" : "guesses"}: ${guesses.join(", ")}`
            : "Your answer: Answer shown",
        ),
      );
    }
  }
  if (game !== "pricerot" && q.item.explanation)
    content.append(el("p", q.item.explanation));
  content.append(source(q.item));
  return content;
}
function drawQuestion() {
  const { s, q, a } = current(),
    complete = answered(game, q, a);
  const heading = el(
    "h2",
    game === "pricerot"
      ? q.item.name
      : game === "orderrot"
        ? q.item.name
        : game === "zoomrot"
          ? "What is this object?"
          : "Which city is this?",
  );
  heading.id = "question-title";
  heading.tabIndex = -1;
  showGameProgress(
    isRush
      ? undefined
      : el("p", `${s.index + 1} of ${s.questions.length}`, "rot-counter"),
  );
  if (photoGame) {
    const prompt = media(q, a, complete);
    prompt.id = "question-title";
    prompt.tabIndex = -1;
    prompt.setAttribute("role", "group");
    prompt.setAttribute("aria-label", heading.textContent!);
    quiz.append(prompt);
  } else {
    quiz.append(heading);
    if (q.item.image) quiz.append(media(q, a, complete));
  }
  if (game === "pricerot")
    quiz.append(
      el("p", `${q.item.size} · ${q.item.retailer}`, "visual-price-label"),
    );
  if (complete) {
    quiz.append(reveal(q, a));
    if (!isRush)
      quiz.append(
        button(
          s.index === s.questions.length - 1 ? "See results" : "Next",
          () => {
            s.index++;
            draft = [];
            imageFailed = false;
            save();
            focusNext = true;
            draw();
          },
          "primary visual-next",
        ),
      );
    return;
  }
  if (photoGame) {
    const choices = el("div", undefined, "choices visual-choices");
    for (const option of q.options) {
      const tried = a.guesses.includes(option.id);
      const node = button(
        option.name,
        () => {
          const guesses = [...a.guesses, option.id];
          commit({
            ...a,
            guesses,
            hint: Math.min(
              2,
              Math.max(
                a.hint,
                guesses.length - Number(option.id === q.item.id),
              ),
            ),
            skipped: isRush && option.id !== q.item.id,
          });
        },
        `choice visual-choice${tried ? " wrong" : ""}`,
      );
      node.disabled = tried || imageFailed;
      choices.append(node);
    }
    const remaining = 3 - a.guesses.length;
    const feedback = el(
      "p",
      a.guesses.length
        ? `${remaining} ${remaining === 1 ? "guess" : "guesses"} left.`
        : a.hint
          ? "3 guesses left."
          : "",
      "rot-feedback visual-attempt-feedback",
    );
    feedback.id = "visual-feedback";
    feedback.tabIndex = -1;
    feedback.setAttribute("role", "status");
    quiz.append(feedback, choices);
    if (
      !isRush &&
      (game !== "skylinerot" ||
        (mode === "practice" && difficulty === "hard")) &&
      a.hint < 2
    ) {
      const hint = button(
        "Reveal a wider view",
        () => commit({ ...a, hint: a.hint + 1 }),
        "secondary visual-hint",
      );
      const cost = el(
        "span",
        `${photoPoints(a.hint)} → ${photoPoints(a.hint + 1)} points`,
        "visual-hint-cost",
      );
      hint.append(cost);
      quiz.append(hint);
    }
  } else if (game === "pricerot") {
    quiz.append(priceControl((price) => commit({ ...a, price })));
  } else {
    if (!draft.length) draft = q.tiles.map((x) => x.id);
    if (!/\bfirst\b/i.test(q.item.name))
      quiz.append(el("p", "Lowest first", "visual-note"));
    const list = el("ol", undefined, "visual-order");
    for (const [index, id] of draft.entries()) {
      const tile = q.tiles.find((x) => x.id === id)!;
      const row = el("li");
      row.append(el("span", tile.name));
      for (const [direction, offset] of [
        ["up", -1],
        ["down", 1],
      ] as const) {
        const move = button(direction === "up" ? "Up" : "Down", () => {
          [draft[index], draft[index + offset]] = [
            draft[index + offset]!,
            draft[index]!,
          ];
          draw();
          const moved = quiz.querySelector<HTMLButtonElement>(
            `[data-move="${id}-${direction}"]`,
          );
          const fallback = quiz.querySelector<HTMLButtonElement>(
            `[data-move="${id}-${direction === "up" ? "down" : "up"}"]`,
          );
          (moved?.disabled ? fallback : moved)?.focus();
        });
        move.setAttribute("aria-label", `Move ${tile.name} ${direction}`);
        move.dataset.move = `${id}-${direction}`;
        move.disabled = index + offset < 0 || index + offset >= draft.length;
        row.append(move);
      }
      list.append(row);
    }
    quiz.append(
      list,
      button(
        "Check order",
        () => commit({ ...a, order: [...draft] }),
        "primary",
      ),
    );
  }
  const actions = el("div", undefined, "rot-actions visual-reveal-actions");
  if (!isRush)
    actions.append(
      button(
        "Show answer",
        () => commit({ ...a, skipped: true }),
        "secondary reveal-answer",
      ),
    );
  if (imageFailed)
    actions.append(button("Reload puzzle", () => location.reload()));
  quiz.append(actions);
}
function drawResults() {
  showGameProgress();
  const s = sessions[mode];
  const score = gradeVisual(game, s.questions, s.answers) ?? 0;
  const title = el("h2", `${score} / ${s.questions.length * 100} points`);
  title.id = "question-title";
  title.tabIndex = -1;
  const dots = s.answers
    .map((a, i) =>
      answerPoints(game, s.questions[i]!, a) >= 65
        ? "🟩"
        : answerPoints(game, s.questions[i]!, a) > 0
          ? "🟨"
          : "⬛",
    )
    .join("");
  quiz.append(title);
  const review = el("ol", undefined, "visual-recap");
  for (const [i, q] of s.questions.entries()) {
    const li = el("li"),
      details = el("details"),
      summary = el("summary");
    summary.append(
      el("span", q.item.name),
      el(
        "span",
        s.answers[i]!.skipped
          ? "Answer shown"
          : `${answerPoints(game, q, s.answers[i]!)} / 100`,
      ),
    );
    details.append(summary, reveal(q, s.answers[i]!, true));
    li.append(details);
    review.append(li);
  }
  const reviewTitle = el("h3", "Review answers");
  quiz.append(reviewTitle, review);
  if (mode === "daily") {
    const rank = el("div", undefined, "daily-rank");
    void showRank(
      rank,
      {
        game,
        day,
        puzzle: visualPuzzle(s.questions),
        answers: s.answers.map((a) => ({ ...a })),
      },
      score,
    );
    quiz.append(rank);
  }
  if (!inFeed) {
    const actions = el("div", undefined, "rot-actions");
    const status = el("div");
    status.setAttribute("role", "status");
    if (mode === "daily")
      actions.append(
        button("Copy results", () => {
          void (async () => {
            const text = `${gameName(game)} ${day}\n${score} / 500 points\n${dots}\nhttps://trainrot.vercel.app/${game}/`;
            try {
              await navigator.clipboard.writeText(text);
              status.textContent = "Copied results.";
            } catch {
              const area = el("textarea", undefined, "rot-copy");
              area.value = text;
              area.readOnly = true;
              area.setAttribute("aria-label", "Results to copy");
              status.replaceChildren(area);
              area.focus();
              area.select();
            }
          })();
        }),
      );
    actions.append(
      button(
        mode === "daily" ? "Play practice" : "New set",
        () => {
          if (mode === "practice") {
            sessions.practice = mount(freshSeed(), undefined, difficulty);
            save();
            draft = [];
            focusNext = true;
            draw();
          } else selectMode("practice");
        },
        "primary",
      ),
    );
    quiz.insertBefore(actions, reviewTitle);
    quiz.insertBefore(status, reviewTitle);
  }
  reportDaily(
    "complete",
    `${score} / 500 points`,
    day,
    storageKey(`daily:${day}`),
  );
}
function draw() {
  const question = sessions[mode].questions[sessions[mode].index];
  if (question !== renderedQuestion) quiz.style.removeProperty("min-height");
  renderedQuestion = question;
  settings?.sync(difficulty, mode === "practice");
  controls.forEach((control) =>
    control.setAttribute("aria-pressed", String(control.id === mode)),
  );
  quiz.replaceChildren();
  const complete = sessions[mode].index >= sessions[mode].questions.length;
  if (complete) drawResults();
  else {
    drawQuestion();
    reportDaily("playing", undefined, day, storageKey(`daily:${day}`));
  }
  if (focusNext) {
    quiz.querySelector<HTMLElement>("#question-title")?.focus();
    focusNext = false;
  }
}
async function start() {
  rows = await loadDataset<VisualItem[]>(`/games/data/${game}.json`, "visual");
  if (isRush) {
    const saved = readRushDraft<{
      seed: string;
      answers: VisualAnswer[];
      draft: string[];
    }>();
    mode = "daily";
    sessions.daily = mount(rushSeed(game), saved as JsonValue);
    if (sessions.daily.index !== 0) sessions.daily = mount(rushSeed(game));
    const tiles = sessions.daily.questions[0].tiles;
    if (
      tiles &&
      Array.isArray(saved?.draft) &&
      saved.draft.length === tiles.length &&
      new Set(saved.draft).size === tiles.length &&
      saved.draft.every((id) => tiles.some((t) => t.id === id))
    )
      draft = saved.draft;
    saveRushDraft(() => ({
      seed: sessions.daily.seed,
      answers: sessions.daily.answers,
      draft,
    }));
    onRushTimeout(() => {
      const { q, a } = current();
      if (q && !answered(game, q, a))
        sessions.daily.answers[0] = { ...a, skipped: true };
      draw();
    });
    draw();
    // The parent must not start the timer until the puzzle image has decoded.
    const img = quiz.querySelector("img");
    if (img) await img.decode();
    reportRush("ready");
    return;
  }
  await waitForFeedActivation();
  day = dailyDate();
  loadPractice = () => {
    const saved = read(practiceSlot(difficulty));
    const seed =
      saved &&
      typeof saved === "object" &&
      "seed" in saved &&
      typeof saved.seed === "string" &&
      saved.seed.startsWith("practice:") &&
      saved.seed.length < 100
        ? saved.seed
        : freshSeed();
    return mount(seed, saved, difficulty);
  };
  sessions.daily = mount(day, read(`daily:${day}`));
  if (mode === "practice") sessions.practice = loadPractice();
  if (photoGame && !inFeed) {
    settings = practiceSettings(
      {
        easy: "Wider views.",
        standard: "",
        hard: "Tighter details. More similar answer choices.",
      },
      (next) => {
        if (next === difficulty) return;
        save();
        difficulty = next;
        write("difficulty", difficulty);
        sessions.practice = loadPractice();
        draft = [];
        imageFailed = false;
        save();
        draw();
      },
    );
    quiz.before(settings.element);
  }
  for (const control of controls)
    control.onclick = () =>
      selectMode(control.id === "practice" ? "practice" : "daily");
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && resetDay() && mode === "daily") draw();
  });
  window.addEventListener("pageshow", () => {
    if (resetDay() && mode === "daily") draw();
  });
  setInterval(() => {
    if (resetDay() && mode === "daily") draw();
  }, 30000);
  draw();
}
void start().catch(() => {
  reportRush("error");
  reportDaily("error");
  quiz.replaceChildren(
    el("p", "The game could not load. Please try again.", "rot-feedback"),
    button("Reload game", () => location.reload(), "primary"),
  );
});
