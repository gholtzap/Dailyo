import { gameName } from "../game-names.js";
import type { Mode, QuizGame, QuizItem } from "../types.js";
import { showGameProgress } from "./help.js";
import {
  dailyDate as dateToday,
  inFeed,
  reportDaily,
  waitForFeedActivation,
  rushRound,
  reportRush,
  onRushTimeout,
  startPractice,
  rushSeed,
} from "../daily/bridge.js";
import {
  shuffle,
  quizDeck,
  quizPool,
  quizOptions,
  quizPuzzle,
  languageSample,
} from "../daily/puzzles.js";
import { showRank } from "../daily/rank.js";

const kind = document.body.dataset.game as QuizGame;
const vocabulary = kind === "vocabulary";
const quiz = document.querySelector<HTMLElement>("#quiz")!;
const controls = {
  daily: document.querySelector<HTMLButtonElement>("#daily")!,
  practice: document.querySelector<HTMLButtonElement>("#practice")!,
};
const key = (part: string) => `trainrot:${kind}:v1:${part}`;
const read = <T = WorldState>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: WorldState | Mode) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const randomSeed = () => `${Date.now()}:${Math.random()}`;
const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
interface WorldState {
  index: number;
  answers: string[];
  seed: string;
  total: number;
  correct: number;
  selected: string | null;
}
const blank = (): WorldState => ({
  index: 0,
  answers: [],
  seed: "",
  total: 0,
  correct: 0,
  selected: null,
});
const modeState: Record<Mode, WorldState> = {
  daily: blank(),
  practice: blank(),
};
let mode: Mode = "daily",
  day = "",
  items: QuizItem[] = [];
function knownAnswer(id: string) {
  if (typeof id !== "string") return false;
  if (vocabulary && /:[1-3]$/.test(id)) id = id.slice(0, -2);
  return items.some((item) => item.id === id);
}
function dailyState(fallback?: WorldState): WorldState {
  const stored = read<WorldState>(key(`daily:${day}`));
  if (
    stored &&
    Number.isInteger(stored.index) &&
    stored.index >= 0 &&
    stored.index <= 5 &&
    Array.isArray(stored.answers) &&
    stored.answers.length >= stored.index &&
    stored.answers.length <= Math.min(5, stored.index + 1) &&
    stored.answers.every(knownAnswer) &&
    (stored.index !== 5 || stored.answers.length === 5)
  )
    return stored;
  return fallback ?? blank();
}
function practiceState() {
  const s = read<WorldState>(key("practice"));
  if (
    s &&
    typeof s.seed === "string" &&
    s.seed.length < 100 &&
    Number.isInteger(s.index) &&
    s.index >= 0 &&
    s.index < items.length &&
    Number.isInteger(s.total) &&
    s.total >= 0 &&
    Number.isInteger(s.correct) &&
    s.correct >= 0 &&
    s.correct <= s.total &&
    (s.selected === null || knownAnswer(s.selected))
  )
    return s;
  return { ...blank(), seed: randomSeed() };
}
function save() {
  write(key(mode === "daily" ? `daily:${day}` : "practice"), modeState[mode]);
}
function resetDay() {
  const today = dateToday();
  if (day === today) return false;
  day = today;
  modeState.daily = dailyState();
  if (mode === "daily") draw();
  return true;
}
function selectMode(next: Mode) {
  resetDay();
  if (next === mode) return;
  mode = next;
  if (mode === "daily") modeState.daily = dailyState(modeState.daily);
  else if (!read(key("practice"))) save();
  write(key("mode"), mode);
  draw();
}
function withCurrentProgress(action: () => void) {
  if (mode !== "daily") return action();
  const current = modeState.daily,
    date = day;
  const update = () => {
    if (mode !== "daily" || day !== date || modeState.daily !== current) return;
    if (resetDay()) {
      document.querySelector<HTMLElement>("#question-title")?.focus();
      return;
    }
    const latest = dailyState(current);
    if (
      latest.index !== current.index ||
      latest.answers.length !== current.answers.length ||
      latest.answers.some((id, index) => id !== current.answers[index])
    ) {
      modeState.daily = latest;
      draw();
      (
        document.querySelector<HTMLElement>(".result h2") ??
        document.querySelector<HTMLElement>("#question-title")
      )?.focus();
      return;
    }
    action();
  };
  if (navigator.locks)
    return navigator.locks.request(key(`daily:${date}`), update);
  update();
}
let deckDay: string, deck: QuizItem[];
function dailyDeck() {
  if (deckDay !== day) {
    deck = quizDeck(items, kind, day);
    deckDay = day;
  }
  return deck;
}
function question() {
  const s = modeState[mode],
    seed =
      mode === "daily"
        ? rushRound === null
          ? `daily:${kind}:${day}`
          : rushSeed(kind)
        : s.seed;
  return {
    item: (mode === "daily" && rushRound === null
      ? dailyDeck()
      : shuffle(quizPool(items, kind, seed), seed))[s.index],
    seed: `${seed}:${s.index}`,
  };
}
function choose(id: string, item: QuizItem) {
  const s = modeState[mode];
  if (rushRound !== null) {
    if (s.answers[s.index] !== undefined) return;
    s.answers[s.index] = id;
    draw();
    reportRush("answered", id === item.id);
    return;
  }
  if (mode === "daily") {
    if (s.index >= 5 || s.answers.length > s.index) return;
    s.answers.push(id);
  } else {
    if (s.selected !== null) return;
    s.selected = id;
    s.total++;
    if (id === item.id) s.correct++;
  }
  save();
  draw();
  document
    .querySelector<HTMLElement>("#next")
    ?.focus({ preventScroll: inFeed });
}
function advance() {
  const s = modeState[mode];
  if (mode === "daily") {
    if (s.index >= 5 || s.answers.length !== s.index + 1) return;
    s.index++;
  } else {
    if (s.selected === null) return;
    const previous = question().item.id;
    s.index++;
    s.selected = null;
    if (s.index >= items.length) {
      s.index = 0;
      do {
        s.seed = randomSeed();
      } while (shuffle(items, s.seed)[0].id === previous && items.length > 1);
    }
  }
  save();
  draw();
  (
    document.querySelector<HTMLElement>("#question-title") ??
    document.querySelector<HTMLElement>(".result h2")
  )?.focus();
}
function dailyProgress() {
  const state = modeState.daily,
    deck = dailyDeck(),
    list = make("ol", undefined, "daily-progress");
  list.setAttribute("aria-label", "Daily question progress");
  for (let i = 0; i < 5; i++) {
    const status =
      i < state.answers.length
        ? state.answers[i] === deck[i].id
          ? "correct"
          : "incorrect"
        : i === state.index
          ? "current"
          : "upcoming";
    const dot = make("li", undefined, `progress-dot ${status}`);
    dot.setAttribute("aria-label", `Question ${i + 1}: ${status}`);
    dot.textContent = String(i + 1);
    list.append(dot);
  }
  return list;
}
function result() {
  showGameProgress();
  const s = modeState.daily,
    deck = dailyDeck(),
    score = s.answers.filter((answer, i) => answer === deck[i].id).length;
  const box = make("div", undefined, "result"),
    title = make("h2", `${score} out of 5`);
  title.tabIndex = -1;
  box.append(title, dailyProgress());
  const rank = make("div", undefined, "daily-rank");
  box.append(rank);
  showRank(
    rank,
    { game: kind, day, puzzle: quizPuzzle(deck), answers: s.answers },
    score,
  );
  const review = make("section", undefined, "answer-review");
  review.setAttribute("aria-label", "Review answers");

  for (const [index, item] of deck.entries()) {
    const details = make("details"),
      summary = make("summary");
    const selected = s.answers[index],
      correct = selected === item.id;
    summary.append(
      make("span", `${index + 1}. ${vocabulary ? item.id : item.name}`),
      make("span", correct ? "Correct" : "Missed"),
    );
    details.append(summary);
    if (kind === "flags") {
      const image = make("img", undefined, "review-flag");
      image.src = `/games/flags/${encodeURIComponent(item.id)}.svg`;
      image.alt = `Flag of ${item.name}`;
      details.append(image);
    } else if (vocabulary) details.append(make("p", `Answer: ${item.name}`));
    else {
      const sample = make(
        "p",
        languageSample(item.samples!, `daily:${kind}:${day}:${index}`),
        "review-sample",
      );
      sample.dir = "auto";
      details.append(sample);
    }
    if (!correct) {
      const guess = quizOptions(
        items,
        kind,
        item,
        `daily:${kind}:${day}:${index}`,
      ).find((option) => option.id === selected);
      if (guess) details.append(make("p", `Your answer: ${guess.name}`));
    }
    if (vocabulary && item.example) details.append(make("p", item.example));
    review.append(details);
  }
  const reviewToggle = make("details", undefined, "result-review");
  reviewToggle.append(make("summary", "Review answers"), review);
  box.append(reviewToggle);
  if (!inFeed) {
    const actions = make("div", undefined, "result-actions"),
      status = make("p");
    status.setAttribute("role", "status");
    const copy = make("button", "Copy results", "secondary");
    copy.type = "button";
    copy.onclick = async () => {
      const text = [
        `${gameName(kind)} ${day}`,
        `${score} out of 5`,
        s.answers
          .map((answer, i) => (answer === deck[i].id ? "🟩" : "⬛"))
          .join(""),
        `https://trainrot.vercel.app${location.pathname}`,
      ].join("\n");
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = "Copied results.";
      } catch {
        const area = make("textarea", undefined, "rot-copy");
        area.value = text;
        area.readOnly = true;
        area.setAttribute("aria-label", "Results to copy");
        status.replaceChildren(area);
        area.focus();
        area.select();
      }
    };
    const practice = make("button", "Play practice", "primary");
    practice.type = "button";
    practice.onclick = () => selectMode("practice");
    actions.append(copy, practice);
    box.append(actions, status);
  }
  quiz.replaceChildren(box);
  reportDaily("complete", title.textContent, day);
}
function draw() {
  for (const [id, button] of Object.entries(controls))
    button.setAttribute("aria-pressed", String(id === mode));
  const s = modeState[mode];
  if (rushRound === null && mode === "daily" && s.index === 5) {
    result();
    return;
  }
  const { item, seed } = question(),
    selected = mode === "daily" ? (s.answers[s.index] ?? null) : s.selected;
  const head = make("div", undefined, "round-head"),
    counter = make(
      "p",
      mode === "daily"
        ? `Question ${s.index + 1} of 5`
        : `Question ${s.total + (selected === null ? 1 : 0)}`,
    ),
    score = make(
      "p",
      rushRound !== null
        ? ""
        : mode === "daily"
          ? `${s.answers.slice(0, s.index + (selected !== null ? 1 : 0)).filter((v, i) => v === dailyDeck()[i].id).length} correct`
          : `${s.correct} correct`,
    );
  if (mode !== "daily") head.append(counter);
  head.append(score);
  showGameProgress(rushRound === null ? head : undefined);
  const prompt = make("div", undefined, "prompt");
  prompt.id = "question-title";
  prompt.tabIndex = -1;
  if (kind === "flags") {
    const image = make("img", undefined, "flag");
    image.src = `/games/flags/${encodeURIComponent(item.id)}.svg`;
    image.alt = "Flag to identify";
    image.onerror = () => {
      image.replaceWith(make("p", "This flag could not be loaded."));
    };
    prompt.append(image);
  } else if (vocabulary) {
    prompt.append(make("h2", item.id, "vocabulary-word"));
  } else {
    const text = make("p", languageSample(item.samples!, seed), "sample");
    text.dir = "auto";
    prompt.append(text);
  }
  const choices = make("div", undefined, "choices");
  choices.setAttribute("role", "group");
  choices.setAttribute(
    "aria-label",
    kind === "flags"
      ? "Choose a place"
      : vocabulary
        ? "Choose a definition"
        : "Choose a language",
  );
  const options = quizOptions(items, kind, item, seed);
  for (const option of options) {
    const button = make("button", option.name, "choice");
    button.type = "button";
    button.disabled = selected !== null;
    const correct = selected !== null && option.id === item.id;
    const wrong = selected === option.id && !correct;
    if (correct || wrong) {
      button.classList.add(correct ? "correct" : "wrong");
      const mark = make("span", correct ? "✓" : "×", "choice-mark");
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    button.onclick = () =>
      rushRound === null
        ? withCurrentProgress(() => choose(option.id, item))
        : choose(option.id, item);
    choices.append(button);
  }
  const next = make(
    "button",
    mode === "daily" && s.index === 4 ? "See results" : "Next",
    "primary",
  );
  next.id = "next";
  next.type = "button";
  next.hidden = selected === null;
  next.onclick = () => withCurrentProgress(advance);
  const content = [prompt, choices];
  if (selected !== null) {
    const wrong = options.find(
      (option) => option.id === selected && selected !== item.id,
    );
    const outcome =
      selected === item.id
        ? "Correct."
        : wrong
          ? `Selected ${wrong.name}. Correct answer: ${item.name}.`
          : `Correct answer: ${item.name}.`;
    const status = make(
      "span",
      outcome,
      "quiz-answer-status screen-reader-only",
    );
    status.id = "answer-feedback";
    status.setAttribute("role", "status");
    choices.append(status);
    next.setAttribute("aria-describedby", status.id);
    if (vocabulary) content.push(make("p", item.example, "feedback example"));
  }
  if (rushRound !== null) quiz.replaceChildren(...content);
  else if (mode === "daily")
    quiz.replaceChildren(dailyProgress(), ...content, next);
  else quiz.replaceChildren(...content, next);
  reportDaily("playing", undefined, day);
}
async function start() {
  const response = await fetch(`/games/data/${kind}.json`);
  if (!response.ok) throw new Error("Could not load game data");
  items = await response.json();
  if (
    !Array.isArray(items) ||
    items.length < 5 ||
    items.some(
      (x) =>
        !x ||
        typeof x.id !== "string" ||
        typeof x.name !== "string" ||
        (kind === "languages" &&
          (!Array.isArray(x.samples) || !x.samples.length)),
    )
  )
    throw new Error("Invalid game data");
  if (
    vocabulary &&
    (new Set(items.map((item) => item.id)).size !== items.length ||
      items.some(
        (item) =>
          !/^[a-z]+$/.test(item.id) ||
          !item.name.trim() ||
          typeof item.example !== "string" ||
          !item.example.trim() ||
          !Array.isArray(item.distractors) ||
          item.distractors.length !== 3 ||
          item.distractors.some(
            (option) => typeof option !== "string" || !option.trim(),
          ) ||
          new Set([item.name, ...item.distractors]).size !== 4,
      ))
  )
    throw new Error("Invalid vocabulary data");
  await waitForFeedActivation();
  day = dateToday();
  if (rushRound !== null) {
    modeState.daily = { ...blank(), index: rushRound % items.length };
    onRushTimeout(() => choose("", question().item));
    draw();
    await quiz.querySelector("img")?.decode();
    reportRush("ready");
    return;
  }
  modeState.daily = dailyState();
  modeState.practice = practiceState();
  const saved = read<string>(key("mode"));
  mode =
    startPractice || (!inFeed && saved === "practice") ? "practice" : "daily";
  controls.daily.onclick = () => selectMode("daily");
  controls.practice.onclick = () => selectMode("practice");
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resetDay();
  });
  setInterval(resetDay, 30000);
  draw();
}
start().catch(() => {
  reportRush("error");
  reportDaily("error");
  const message = make("p", "The game could not load.");
  const button = make("button", "Reload game", "primary");
  button.type = "button";
  button.onclick = () => location.reload();
  quiz.replaceChildren(message, button);
});
