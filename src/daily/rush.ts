import { sizeFeedFrame } from "./frame-size.js";
import { RushMachine } from "../verified/rush-state.js";
import type { RushEffect } from "../verified/rush.mjs";
import { required } from "../dom.js";
import type { RushMessage, RushHelpMessage } from "../types.js";
interface Round {
  frame: HTMLIFrameElement;
  ready: boolean;
}
import { rushDate, shuffle } from "./puzzles.js";
import { closeRushAudio } from "./rush-audio.js";
import { gameName } from "../game-names.js";

import { rushGames as rotation, individualRushGames } from "./rush-games.js";
const slug = location.pathname.split("/")[2];
const selected = individualRushGames.find(
  (game) => game.label.toLowerCase() === slug,
);
let games = selected ? [selected] : [...rotation];
const date = rushDate(new URLSearchParams(location.search).get("date"));
const bestKey = `dailyo:rush:best:${selected ? slug : "all"}`;
if (selected) document.title = `${gameName(selected.label)} Rush | dailyo`;
const $ = required;
const panel = $("#feed-game"),
  status = $("#rush-status"),
  clock = $("#rush-clock");
const timeDisplay = $(".rush-time");
const actions = $(".feed-actions"),
  retry = $("#rush-retry"),
  next = $("#rush-next");
const pause = $("#rush-pause");
const gameHelp = document.createElement("button");
gameHelp.type = "button";
gameHelp.id = "rush-help";
gameHelp.className = "game-icon";
gameHelp.textContent = "How to play";
gameHelp.setAttribute("aria-haspopup", "dialog");
gameHelp.hidden = true;
actions.append(gameHelp);
gameHelp.onclick = () => {
  const doc = panel.querySelector<HTMLIFrameElement>(
    "iframe[title]:not([hidden])",
  )?.contentDocument;
  const dialog = doc?.querySelector<HTMLDialogElement>("#help-dialog");
  if (!dialog || dialog.open) return;
  dialog.addEventListener("close", () => gameHelp.focus(), { once: true });
  doc?.querySelector<HTMLButtonElement>("#help")?.click();
};
const pauseSurface = $("#rush-resume-panel");
const resumeCard =
  pauseSurface.querySelector<HTMLElement>(".rush-resume-card")!;
// Keep spatial drafts visible. Knowledge questions remain masked while their clock is stopped.
const previewGames = new Set([
  "trainrot",
  "maprot",
  "borderrot",
  "swaprot",
  "orderrot",
  "trackrot",
  "anglerot",
  "splitrot",
]);
function positionPauseSurface() {
  if (pauseSurface.hidden || !visible?.contentDocument) return;
  const board = [
    ".perception-field",
    ".angle-board",
    ".split-field",
    ".rot-map",
    ".map-panel",
    ".swap-board",
    ".visual-order",
    "#quiz",
  ]
    .map((selector) =>
      visible!.contentDocument!.querySelector<Element>(selector),
    )
    .find((element) => element !== null);
  if (!board) return;
  const rect = board.getBoundingClientRect();
  const frame = visible.getBoundingClientRect();
  const area = pauseSurface.parentElement!;
  const bounds = area.getBoundingClientRect();
  const preview = pauseSurface.hasAttribute("data-preview");
  // A short tile rack stays unobstructed; larger boards carry Resume in place.
  const below = preview && rect.height < 160;
  const height = Math.min(
    below ? 136 : Math.max(preview ? 160 : 240, rect.height),
    480,
    Math.max(160, area.clientHeight - 32),
  );
  const top =
    frame.top -
    bounds.top +
    area.scrollTop +
    (below ? rect.bottom + 16 : rect.top);
  pauseSurface.style.left = `${frame.left - bounds.left + rect.left}px`;
  pauseSurface.style.top = `${Math.max(area.scrollTop + 8, Math.min(top, area.scrollTop + area.clientHeight - height - 8))}px`;
  pauseSurface.style.width = `${rect.width}px`;
  pauseSurface.style.height = `${height}px`;
}
let pauseLayout: ResizeObserver | undefined;
const reviewButton = $("#rush-review"),
  recapReview = $("#rush-review-recap");
const streakLabel = $("#rush-streak");
const roundLabel = document.createElement("span");
roundLabel.id = "rush-round";
$("#rush-game-name").after(roundLabel);
const scores = games.map(() => 0);
const copyStatus = $("#rush-copy-status"),
  copyText = $("#rush-copy-text");
const run = new RushMachine();
let runId = "";
let index = 0,
  round = 0,
  duration = 0;
let streak = 0;
function showStreak(celebrate = false) {
  streakLabel.hidden = streak === 0;
  streakLabel.replaceChildren();
  if (streak) {
    const blocks = document.createElement("span");
    blocks.className = "streak-blocks";
    blocks.setAttribute("aria-hidden", "true");
    for (let i = 0; i < Math.min(streak, 10); i++) {
      const block = document.createElement("span");
      block.className = "streak-block";
      blocks.append(block);
    }
    streakLabel.append(document.createTextNode(`Streak ${streak}`), blocks);
    streakLabel.setAttribute("aria-label", `Streak: ${streak}`);
  } else streakLabel.removeAttribute("aria-label");
  streakLabel.classList.toggle(
    "rush-milestone",
    celebrate && streak > 0 && streak % 5 === 0,
  );
}
const saveKey = `dailyo:rush:run:${selected ? slug : "all"}`;
interface SavedRun {
  date: string;
  games: string;
  runId: string;
  index: number;
  round: number;
  remaining: number;
  scores: number[];
  streak?: number;
}
let recovery: SavedRun | null = null;
function roundDuration(gameIndex: number, roundIndex: number, order = games) {
  const game = order[gameIndex],
    timedRound = roundIndex + Number(gameIndex > 0);
  return game && timedRound
    ? game.seconds[Math.min(timedRound, game.seconds.length) - 1] * 1000
    : 0;
}
function checkpoint(
  gameIndex = index,
  roundIndex = round,
  remaining = recovery?.remaining ??
    run.remaining ??
    (Number.isFinite(run.deadline)
      ? Math.max(0, run.deadline - performance.now())
      : roundDuration(gameIndex, roundIndex)),
) {
  try {
    sessionStorage.setItem(
      saveKey,
      JSON.stringify({
        date,
        games: games.map((g) => g.label).join(","),
        runId,
        index: gameIndex,
        round: roundIndex,
        remaining,
        scores,
        streak,
      }),
    );
  } catch {}
}
function readCheckpoint(): SavedRun | null {
  try {
    const s = JSON.parse(
      sessionStorage.getItem(saveKey) ?? "null",
    ) as SavedRun | null;
    const labels = typeof s?.games === "string" ? s.games.split(",") : [];
    const eligible = selected ? [selected] : rotation;
    const order = labels.map((label) =>
      eligible.find((game) => game.label === label),
    );
    if (
      s &&
      s.date === date &&
      labels.length === eligible.length &&
      new Set(labels).size === eligible.length &&
      order.every((game) => game !== undefined) &&
      typeof s.runId === "string" &&
      /^[\da-f-]{36}$/i.test(s.runId) &&
      Number.isSafeInteger(s.index) &&
      s.index >= 0 &&
      s.index <= games.length &&
      Number.isSafeInteger(s.round) &&
      s.round >= 0 &&
      s.round <= 1_000_000 &&
      Number.isFinite(s.remaining) &&
      s.remaining >= 0 &&
      s.remaining <= roundDuration(s.index, s.round, order as typeof games) &&
      (s.remaining > 0 ||
        roundDuration(s.index, s.round, order as typeof games) === 0) &&
      Array.isArray(s.scores) &&
      s.scores.length === games.length &&
      s.scores.every(
        (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000,
      ) &&
      (s.streak === undefined ||
        (Number.isSafeInteger(s.streak) &&
          s.streak >= 0 &&
          s.streak <= s.scores.reduce((n, score) => n + score, 0)))
    ) {
      games = order as typeof games;
      return s;
    }
  } catch {}
  return null;
}
function helpOpen() {
  return !!visible?.contentDocument?.querySelector("#help-dialog[open]");
}
function updatePauseControl() {
  pause.hidden =
    helpOpen() ||
    !["playing", "paused"].includes(run.phase) ||
    (run.phase === "playing" && !Number.isFinite(run.deadline));
  const paused = run.phase === "paused" && review.state !== "previous";
  pause.textContent = paused ? "Resume" : "Pause";
  pause.className = paused ? "primary" : "rush-pause-control";
  (paused ? resumeCard : actions).append(pause);
  pauseSurface.hidden = !paused || helpOpen();
  document.body.dataset.rushPhase = paused ? "paused" : run.phase;
  pauseSurface.toggleAttribute(
    "data-preview",
    previewGames.has(games[index]?.label),
  );
  pauseLayout?.disconnect();
  if (!pauseSurface.hidden && visible?.contentDocument) {
    positionPauseSurface();
    pauseLayout = new ResizeObserver(positionPauseSurface);
    pauseLayout.observe(visible.contentDocument.body);
    pauseLayout.observe(visible);
    pauseLayout.observe(pauseSurface.parentElement!);
  }
}
let current: Round | null | undefined,
  visible: HTMLIFrameElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined,
  ticker: ReturnType<typeof setInterval> | undefined;
let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
const upcoming = new Map<string, Round>();

// Feedback + press -> held until release; Feedback + Keep -> held until Next; inspection/background resume on close/return.
// Playing/Paused/Recap + Review -> previous answer; Back -> same draft and prior pause state.
// Load/replay clears held feedback; stale timers cannot advance a different generation.
type ReviewState =
  | { state: "closed" }
  | {
      state: "held";
      reason: "pointer" | "explicit" | "background" | "inspection";
    }
  | { state: "previous"; from: "playing" | "paused" | "recap"; scroll: number };
let review: ReviewState = { state: "closed" };
const heldPointers = new Set<number>();
let lastAnswer: {
  frame: HTMLIFrameElement;
  game: string;
  round: number;
  label: string;
  outcome: string;
} | null = null;
let advance: {
  generation: number;
  index: number;
  round: number;
  remaining: number;
  deadline: number;
} | null = null;
function updateReviewControl() {
  gameHelp.hidden = !panel
    .querySelector<HTMLIFrameElement>("iframe[title]:not([hidden])")
    ?.contentDocument?.querySelector("#help");
  reviewButton.hidden =
    !lastAnswer ||
    review.state === "previous" ||
    (review.state === "held" && review.reason === "explicit") ||
    run.phase === "loading" ||
    run.phase === "error";
  const reviewLabel =
    run.phase === "feedback" ? "Keep answer" : "Review answer";
  // Replacing a pressed button's text node can cancel its click in WebKit.
  if (reviewButton.textContent !== reviewLabel)
    reviewButton.textContent = reviewLabel;
  recapReview.hidden = !lastAnswer;
}
function scheduleAdvance() {
  if (!advance || review.state !== "closed" || run.phase !== "feedback") return;
  advance.deadline = performance.now() + advance.remaining;
  const pending = advance;
  timer = setTimeout(() => {
    if (
      advance === pending &&
      review.state === "closed" &&
      run.phase === "feedback"
    )
      openRound(pending.index, pending.round, pending.generation);
  }, pending.remaining);
}
function holdAnswer(
  reason: "pointer" | "explicit" | "background" | "inspection",
) {
  if (run.phase !== "feedback" || !advance || review.state === "previous")
    return;
  if (review.state === "closed")
    advance.remaining = Math.max(0, advance.deadline - performance.now());
  if (
    review.state === "held" &&
    (review.reason === "explicit" ||
      (review.reason === "inspection" && reason !== "explicit") ||
      (review.reason === "background" && reason === "pointer"))
  )
    return;
  clearTimeout(timer);
  review = { state: "held", reason };
  updateReviewControl();
}
function inspectingAnswer() {
  return [document, visible?.contentDocument].some((doc) =>
    doc?.querySelector("dialog[open],details[open]"),
  );
}
function releaseAnswer(
  reason: "pointer" | "background" | "inspection" = "pointer",
) {
  if (review.state !== "held" || review.reason !== reason) return;
  const remainingReason = document.hidden
    ? "background"
    : inspectingAnswer()
      ? "inspection"
      : heldPointers.size
        ? "pointer"
        : null;
  if (remainingReason) {
    review = { state: "held", reason: remainingReason };
    return;
  }
  review = { state: "closed" };
  if (advance) advance.remaining = Math.max(600, advance.remaining);
  updateReviewControl();
  scheduleAdvance();
}
function watchAnswer(doc: Document) {
  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.button !== 0 ||
        run.phase !== "feedback" ||
        review.state === "previous"
      )
        return;
      heldPointers.add(event.pointerId);
      holdAnswer("pointer");
    },
    true,
  );
  const release = (event: PointerEvent) => {
    heldPointers.delete(event.pointerId);
    if (!heldPointers.size) releaseAnswer();
  };
  doc.addEventListener("pointerup", release, true);
  doc.addEventListener("pointercancel", release, true);
  // Touch scrolling can cancel pointer delivery without a subsequent pointerup.
  doc.addEventListener(
    "touchend",
    () => {
      if (!heldPointers.size) releaseAnswer();
    },
    true,
  );
  doc.addEventListener(
    "touchcancel",
    () => {
      heldPointers.clear();
      releaseAnswer();
    },
    true,
  );
  const inspect = () => {
    if (inspectingAnswer()) holdAnswer("inspection");
    else releaseAnswer("inspection");
  };
  doc.addEventListener("focusin", inspect);
  doc.addEventListener("close", inspect, true);
  doc.addEventListener("toggle", inspect, true);
}
watchAnswer(document);
function openReview() {
  if (!lastAnswer) return;
  if (run.phase === "feedback" && review.state !== "previous") {
    holdAnswer("explicit");
    return;
  }
  if (
    review.state !== "closed" ||
    !["playing", "paused", "recap"].includes(run.phase)
  )
    return;
  const from = run.phase as "playing" | "paused" | "recap";
  if (from === "playing") pauseRound();
  // A deadline reached while opening Review belongs to the newly finished round.
  if (from === "playing" && advance) {
    holdAnswer("explicit");
    return;
  }
  review = { state: "previous", from, scroll: panel.parentElement!.scrollTop };
  clearInterval(ticker);
  clearTimeout(deadlineTimer);
  if (visible) {
    visible.hidden = true;
    visible.inert = true;
  }
  const frame = lastAnswer.frame;
  frame.hidden = false;
  frame.inert = false;
  frame.title = "Previous answer";
  panel.hidden = false;
  actions.hidden = false;
  $("#feed-recap").hidden = true;
  panel.parentElement!.scrollTop = 0;
  timeDisplay.hidden = true;
  streakLabel.hidden = true;
  $("#rush-game-name").textContent = gameName(lastAnswer.game);
  roundLabel.textContent = `Round ${lastAnswer.round}`;
  status.textContent = `${lastAnswer.label} · ${lastAnswer.outcome}`;
  pause.hidden = true;
  pauseSurface.hidden = true;
  next.removeAttribute("disabled");
  next.textContent = from === "recap" ? "Back to recap" : "Back to puzzle";
  next.className = "primary rush-continue";
  next.onclick = closeReview;
  updateReviewControl();
  next.focus();
}
function closeReview() {
  if (review.state !== "previous" || !lastAnswer) return;
  const { from, scroll } = review;
  review = { state: "closed" };
  timeDisplay.hidden = false;
  showStreak();
  for (const dialog of lastAnswer.frame.contentDocument?.querySelectorAll(
    "dialog[open]",
  ) ?? [])
    (dialog as HTMLDialogElement).close();
  lastAnswer.frame.hidden = true;
  lastAnswer.frame.inert = true;
  lastAnswer.frame.removeAttribute("title");
  if (from === "recap") {
    panel.hidden = true;
    actions.hidden = true;
    $("#feed-recap").hidden = false;
    recapReview.focus();
  } else {
    if (visible) visible.hidden = false;
    $("#rush-game-name").textContent = gameName(games[index].label);
    roundLabel.textContent = `Round ${round + 1}`;
    next.textContent = "Skip game";
    next.className = "secondary rush-skip";
    next.onclick = skipGame;
    if (from === "playing" && run.phase === "paused") resumeRound();
    else {
      status.textContent = `${gameName(games[index].label)} · ${run.phase === "paused" ? "Paused" : `Round ${round + 1}`}`;
      next.toggleAttribute("disabled", run.phase === "paused");
      updatePauseControl();
      if (visible) visible.inert = run.phase === "paused";
      reviewButton.focus();
    }
  }
  panel.parentElement!.scrollTop = scroll;
  updateReviewControl();
}
reviewButton.onclick = openReview;
recapReview.onclick = openReview;

function stopClock(preserveDisplay = false) {
  clearTimeout(deadlineTimer);
  clearTimeout(timer);
  clearInterval(ticker);
  if (!preserveDisplay) {
    clock.textContent = "";
    timeDisplay.removeAttribute("data-timed");
  }
}

function makeRound(gameIndex: number, roundIndex: number) {
  const frame = document.createElement("iframe");
  frame.src = `${games[gameIndex].path}?rush=${roundIndex}&date=${date}&run=${runId}`;
  frame.className = "feed-loading";
  frame.dataset.game = games[gameIndex].label;
  frame.inert = true;
  panel.append(frame);
  sizeFeedFrame(frame);
  return { frame, ready: false };
}

function preload(gameIndex: number, roundIndex: number) {
  const key = `${gameIndex}:${roundIndex}`;
  if (games[gameIndex] && !upcoming.has(key))
    upcoming.set(key, makeRound(gameIndex, roundIndex));
}

function openRound(
  gameIndex: number,
  roundIndex = 0,
  generation = run.generation,
) {
  if (run.load(generation).$ === "NoChange") return;
  if (gameIndex !== index) closeRushAudio();
  review = { state: "closed" };
  heldPointers.clear();
  advance = null;
  updateReviewControl();
  updatePauseControl();
  stopClock(true);
  if (current?.frame !== visible) current?.frame.remove();
  index = gameIndex;
  round = roundIndex;
  checkpoint(index, round, recovery?.remaining ?? roundDuration(index, round));
  const game = games[index];
  if (!game) {
    showRecap();
    return;
  }
  $("#rush-game-name").textContent = gameName(game.label);
  roundLabel.textContent = `Round ${round + 1}`;
  retry.hidden = true;
  next.removeAttribute("disabled");
  next.textContent = "Skip game";
  next.className = "secondary rush-skip";
  next.onclick = skipGame;
  panel.hidden = false;
  if (visible) if (visible) visible!.inert = true;
  const key = `${index}:${round}`;
  current = upcoming.get(key);
  upcoming.delete(key);
  for (const [other, slot] of upcoming) {
    if (other === `${index + 1}:0`) continue;
    slot.frame.remove();
    upcoming.delete(other);
  }
  current ??= makeRound(index, round);
  if (current.ready) {
    showRound();
    return;
  }
  status.textContent = `Loading ${gameName(game.label)}…`;
  const loadingGeneration = run.generation;
  timer = setTimeout(() => showError(loadingGeneration), 12000);
}

function showError(generation = run.generation) {
  if (run.fail(generation).$ === "NoChange") return;
  updatePauseControl();
  stopClock();
  current?.frame.remove();
  current = null;
  status.textContent = `${gameName(games[index].label)} didn’t load.`;
  $("#rush-game-name").textContent =
    `${gameName(games[index].label)} couldn’t load`;
  retry.hidden = false;
  retry.focus();
}

function showRound() {
  if (!current) return;
  const game = games[index];
  duration = roundDuration(index, round);
  const restoring = recovery;
  recovery = null;
  if (
    run.ready(
      performance.now(),
      duration ? (restoring?.remaining ?? duration) : undefined,
    ).$ === "NoChange"
  )
    return;
  updatePauseControl();
  stopClock();
  next.textContent = "Skip game";
  next.className = "secondary rush-skip";
  const { frame } = current;
  frame.title = game.label;
  frame.classList.remove("feed-loading");
  if (visible) frame.classList.add("rush-enter");
  if (visible === lastAnswer?.frame) {
    visible!.hidden = true;
    visible!.inert = true;
    visible!.removeAttribute("title");
  } else visible?.remove();
  visible = frame;
  frame.inert = false;
  frame.contentDocument?.documentElement.toggleAttribute(
    "data-rush-preview",
    previewGames.has(game.label),
  );
  if (frame.contentDocument) watchAnswer(frame.contentDocument);
  updateReviewControl();
  status.textContent = `${gameName(game.label)} · Round ${round + 1}`;
  if (duration) {
    timeDisplay.dataset.timed = "";
    updateClock();
    ticker = setInterval(updateClock, 100);
  } else {
    clock.textContent = "";
  }
  pause.hidden = !Number.isFinite(run.deadline);
  if (document.hidden || (restoring && duration)) pauseRound();
  if (run.phase === "paused") pause.focus();
  else
    frame.contentDocument
      ?.querySelector<HTMLElement>(
        "#question-title, #rush-journey, #round-title, #extra-title",
      )
      ?.focus({ preventScroll: true });
  checkpoint();
  actions.style.removeProperty("min-height");
  armDraftDeadline();
  if (run.phase === "playing")
    frame.contentWindow?.postMessage("rush-activate", location.origin);
  if (!document.hidden && !navigator.connection?.saveData) {
    preload(index, round + 1);
    preload(index + 1, 0);
  }
}

function armDraftDeadline() {
  clearTimeout(deadlineTimer);
  if (
    games[index]?.label !== "trackrot" ||
    run.phase !== "playing" ||
    !Number.isFinite(run.deadline)
  )
    return;
  const generation = run.generation;
  deadlineTimer = setTimeout(
    () => {
      if (generation === run.generation && run.phase === "playing") {
        if (performance.now() < run.deadline) armDraftDeadline();
        else finishRound(false, true);
      }
    },
    Math.max(0, run.deadline - performance.now()),
  );
}
function updateClock() {
  const remaining = run.deadline - performance.now();
  if (remaining <= 0) {
    finishRound(false, true);
    return;
  }
  clock.textContent = `${Math.ceil(remaining / 1000)}s`;
  timeDisplay.style.setProperty(
    "--rush-remaining",
    String(Math.min(1, remaining / duration)),
  );
}

function finishRound(correct: boolean, expired = false) {
  if (
    expired &&
    games[index]?.label === "trackrot" &&
    run.phase === "playing"
  ) {
    const snapshot: { correct?: boolean } = {};
    current?.frame.contentWindow?.dispatchEvent(
      new CustomEvent("rush-submit-draft", { detail: snapshot }),
    );
    if (typeof snapshot.correct === "boolean") {
      showFinish(run.deadlineAnswer(snapshot.correct, performance.now()));
      return;
    }
  }
  showFinish(
    expired
      ? run.timeout(performance.now())
      : run.answer(correct, performance.now()),
  );
}

function showFinish(effect: RushEffect) {
  if (effect.$ !== "Finished") return;
  // Preserve the playing header while controls and streak change for feedback.
  actions.style.minHeight = `${actions.getBoundingClientRect().height}px`;
  updatePauseControl();
  const { correct, expired } = effect;
  stopClock(true);
  if (expired && timeDisplay.hasAttribute("data-timed")) {
    clock.textContent = "0s";
    timeDisplay.style.setProperty("--rush-remaining", "0");
  }
  if (correct) scores[index]++;
  streak = correct ? streak + 1 : 0;
  showStreak(true);
  if (lastAnswer && lastAnswer.frame !== visible) lastAnswer.frame.remove();
  lastAnswer = visible
    ? {
        frame: visible,
        game: games[index].label,
        round: round + 1,
        label: `${gameName(games[index].label)} · Round ${round + 1}`,
        outcome: expired ? "Time’s up" : correct ? "Correct" : "Missed",
      }
    : null;
  if (visible) visible.dataset.rushAnswer = "";
  const nextIndex = correct ? index : index + 1,
    nextRound = correct ? round + 1 : 0;
  checkpoint(nextIndex, nextRound, roundDuration(nextIndex, nextRound));
  status.textContent = expired ? "Time’s up" : correct ? "Correct" : "Missed";
  if (expired)
    visible?.contentWindow?.postMessage("rush-timeout", location.origin);
  next.textContent = correct
    ? "Next"
    : index === games.length - 1
      ? "See recap"
      : "Next game";
  next.className = "primary rush-continue";
  status.focus({ preventScroll: true });
  // Spatial results need time to compare the player's mark with the answer.
  // Next advances immediately; held feedback keeps its existing cancellation rules.
  advance = {
    generation: run.generation,
    index: nextIndex,
    round: nextRound,
    remaining: [
      "countrot",
      "trackrot",
      "anglerot",
      "temporot",
      "splitrot",
    ].includes(games[index].label)
      ? 3000
      : correct
        ? 180
        : 2400,
    deadline: 0,
  };
  scheduleAdvance();
  updateReviewControl();
  next.onclick = () => {
    if (run.phase === "feedback" && advance)
      openRound(advance.index, advance.round, advance.generation);
    else skipGame();
  };
}

function showRecap() {
  if (run.complete().$ === "NoChange") return;
  closeRushAudio();
  updatePauseControl();
  current = null;
  visible = null;
  upcoming.clear();
  for (const child of [...panel.children])
    if (child !== lastAnswer?.frame) child.remove();
  if (lastAnswer) {
    lastAnswer.frame.hidden = true;
    lastAnswer.frame.inert = true;
    lastAnswer.frame.removeAttribute("title");
  }
  updateReviewControl();
  panel.hidden = true;
  actions.hidden = true;
  $("#feed-recap").hidden = false;
  document.querySelector<HTMLDetailsElement>(".rush-breakdown")!.open = false;
  copyStatus.textContent = "";
  copyText.hidden = true;
  const { total: sum } = scoreSummary();
  showPersonalBest(sum);
  $("#rush-score").textContent = `${sum} correct`;
  $("#rush-best-streak").textContent = String(Math.max(...scores));
  $("#feed-results").replaceChildren(
    ...games.map((game, i) => {
      const row = document.createElement("li");
      const score = document.createElement("span");
      score.textContent = `${gameName(game.label)} · ${scores[i]} correct`;
      const link = document.createElement("a");
      link.href = `${game.path}?practice=1`;
      link.textContent = "Play more";
      link.setAttribute("aria-label", `Play more ${gameName(game.label)}`);
      row.append(score, link);
      return row;
    }),
  );
  $("#feed-recap h2").focus();
  checkpoint(games.length, 0, 0);
}

window.addEventListener(
  "message",
  (event: MessageEvent<RushMessage | RushHelpMessage>) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "rush-help") {
      if (
        event.source !== visible?.contentWindow ||
        typeof event.data.open !== "boolean"
      )
        return;
      if (event.data.open) {
        holdAnswer("inspection");
        pauseRound();
      } else releaseAnswer("inspection");
      updatePauseControl();
      if (run.phase === "paused") {
        visible!.inert = !helpOpen();
        if (!helpOpen()) pause.focus();
      }
      return;
    }
    const { type, phase: reported, correct } = event.data ?? {};
    if (type !== "rush-game") return;
    if (event.source !== current?.frame.contentWindow) {
      for (const [key, slot] of upcoming) {
        if (event.source !== slot.frame.contentWindow) continue;
        if (reported === "ready") slot.ready = true;
        if (reported === "error") {
          slot.frame.remove();
          upcoming.delete(key);
        }
        break;
      }
      return;
    }
    if (run.phase === "loading" && reported === "ready") showRound();
    if (run.phase === "loading" && reported === "error") showError();
    if (
      run.phase === "playing" &&
      reported === "answered" &&
      typeof correct === "boolean"
    ) {
      if (
        games[index]?.label === "trackrot" &&
        performance.now() >= run.deadline
      )
        finishRound(false, true);
      else showFinish(run.answer(correct, performance.now()));
    }
  },
);

function scoreSummary() {
  const total = scores.reduce((sum, score) => sum + score, 0);
  const best = Math.max(...scores);
  const labels = games
    .filter((_, i) => scores[i] === best)
    .map((game) => gameName(game.label));
  return { total, bestRun: best ? `${best} in ${labels.join(", ")}` : "" };
}

function showPersonalBest(total: number) {
  const label = $("#rush-personal-best");
  label.textContent = "";
  try {
    const saved = Number(localStorage.getItem(bestKey));
    const previous = Number.isSafeInteger(saved) && saved > 0 ? saved : 0;
    if (total > previous) localStorage.setItem(bestKey, String(total));
    if (total || previous)
      label.textContent = `${total > previous ? "New best" : "Personal best"} · ${Math.max(total, previous)} correct`;
  } catch {}
}

function shareText() {
  const title = selected
    ? `dailyo Rush · ${gameName(selected.label)}`
    : "dailyo Rush";
  const { total, bestRun } = scoreSummary();
  const score = `${total} correct${!selected && bestRun ? ` · ${bestRun}` : ""}`;
  const rows = selected
    ? []
    : [
        "",
        ...games.map(
          ({ label }, i) => `${gameName(label)} · ${scores[i]} correct`,
        ),
      ];
  const path = selected ? `/rush/${slug}/` : "/rush/";
  return [
    `${title} · ${date}`,
    score,
    ...rows,
    "",
    `https://trainrot.vercel.app${path}?date=${date}`,
  ].join("\n");
}

$("#rush-copy").onclick = async () => {
  if (run.phase !== "recap") return;
  const text = shareText();
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {}
  if (run.phase !== "recap" || shareText() !== text) return;
  copyStatus.textContent = copied ? "Copied" : "Select and copy your results.";
  copyText.hidden = copied;
  if (!copied) {
    copyText.value = text;
    copyText.focus();
    copyText.select();
  }
};

function start() {
  closeRushAudio();
  lastAnswer?.frame.remove();
  lastAnswer = null;
  review = { state: "closed" };
  heldPointers.clear();
  advance = null;
  updateReviewControl();
  recovery = null;
  runId = crypto.randomUUID();
  games = selected ? [selected] : shuffle(rotation, `rush:order:${runId}`);
  scores.fill(0);
  streak = 0;
  showStreak();
  $("#feed-recap").hidden = true;
  actions.hidden = false;
  openRound(0);
  status.focus({ preventScroll: true });
}
$("#rush-replay").onclick = () => {
  if (run.phase === "recap") start();
};
retry.onclick = () => {
  if (run.phase === "error") openRound(index, round);
};
function skipGame() {
  if (["loading", "playing", "error"].includes(run.phase)) {
    recovery = null;
    streak = 0;
    showStreak();
    openRound(index + 1);
  }
}
next.onclick = skipGame;
function pauseRound() {
  if (
    games[index]?.label === "trackrot" &&
    run.phase === "playing" &&
    performance.now() >= run.deadline
  ) {
    finishRound(false, true);
    return;
  }
  const effect = run.pause(performance.now());
  if (effect.$ === "Finished") {
    showFinish(effect);
    return;
  }
  if (effect.$ !== "Suspended") return;
  updatePauseControl();
  clearInterval(ticker);
  clearTimeout(deadlineTimer);
  if (visible) {
    visible.inert = !helpOpen();
    visible.contentDocument!.documentElement.dataset.rushPaused = "";
  }
  visible?.contentWindow?.postMessage("rush-pause", location.origin);
  status.textContent = `${gameName(games[index].label)} · Paused`;
  $("#rush-game-name").textContent = gameName(games[index].label);
  next.setAttribute("disabled", "");
  if (!helpOpen()) pause.focus({ preventScroll: true });
  checkpoint();
}
function resumeRound() {
  if (helpOpen()) return;
  if (run.resume(performance.now(), !document.hidden).$ !== "Resumed") return;
  updatePauseControl();
  if (visible) {
    visible.inert = false;
    delete visible.contentDocument!.documentElement.dataset.rushPaused;
  }
  visible?.contentWindow?.postMessage("rush-resume", location.origin);
  visible?.contentWindow?.postMessage("rush-activate", location.origin);
  status.textContent = `${gameName(games[index].label)} · Round ${round + 1}`;
  $("#rush-game-name").textContent = gameName(games[index].label);
  next.removeAttribute("disabled");
  updateClock();
  ticker = setInterval(updateClock, 100);
  armDraftDeadline();
  visible?.contentDocument
    ?.querySelector<HTMLElement>(
      "#question-title, #rush-journey, #round-title, #extra-title",
    )
    ?.focus({ preventScroll: true });
  checkpoint();
}
window.addEventListener("resize", positionPauseSurface);
pause.onclick = () => {
  if (run.phase === "paused") resumeRound();
  else pauseRound();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    heldPointers.clear();
    holdAnswer("background");
    pauseRound();
  } else releaseAnswer("background");
});
// Playing + help/background/leave -> Paused; Paused + explicit Resume -> Playing.
// Reload + valid checkpoint -> Loading -> Paused (or untimed Playing); feedback checkpoints the next round once.
window.addEventListener("pagehide", () => {
  closeRushAudio();
  if (run.phase === "playing") pauseRound();
  if (run.phase !== "feedback" && run.phase !== "loading") checkpoint();
});

recovery = readCheckpoint();
if (recovery) {
  runId = recovery.runId;
  scores.splice(0, scores.length, ...recovery.scores);
  streak = recovery.streak ?? 0;
  showStreak();
  $("#feed-recap").hidden = true;
  actions.hidden = false;
  openRound(recovery.index, recovery.round);
} else start();
