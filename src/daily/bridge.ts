import type { DailyMessage, RushMessage } from "../types.js";
import { dailyDate, rushDate } from "./puzzles.js";

export { dailyDate };

const params = new URLSearchParams(location.search);
const round = params.get("rush");
const roundIndex = Number(round);
export const rushRound =
  window.parent !== window &&
  /^\d+$/.test(round ?? "") &&
  Number.isSafeInteger(roundIndex)
    ? roundIndex
    : null;
export const inFeed =
  window.parent !== window &&
  (params.get("feed") === "1" || rushRound !== null);
const rushDay = rushRound === null ? null : rushDate(params.get("date"));
const rushRun =
  rushRound === null ? null : params.get("run") || crypto.randomUUID();
export const rushSeed = (kind: string) => `rush:${kind}:${rushDay}:${rushRun}`;
export const startPractice = !inFeed && params.get("practice") === "1";
if (inFeed) document.documentElement.dataset.dailyFeed = "";
if (rushRound !== null) document.documentElement.dataset.rush = "";

// Only the displayed round checkpoints its draft; preloaded frames never overwrite it.
export function readRushDraft<T>(): T | null {
  if (rushRound === null) return null;
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("dailyo:rush:draft") ?? "null",
    );
    return saved?.run === rushRun &&
      saved.round === rushRound &&
      saved.path === location.pathname
      ? (saved.value as T)
      : null;
  } catch {
    return null;
  }
}
export function saveRushDraft(read: () => unknown) {
  if (rushRound === null) return;
  window.addEventListener("pagehide", () => {
    if (
      !window.frameElement?.hasAttribute("title") ||
      window.frameElement.hasAttribute("data-rush-answer")
    )
      return;
    try {
      sessionStorage.setItem(
        "dailyo:rush:draft",
        JSON.stringify({
          run: rushRun,
          round: rushRound,
          path: location.pathname,
          value: read(),
        }),
      );
    } catch {}
  });
}

// Upcoming games can load data before they read or change the player's session.
export function waitForFeedActivation() {
  if (!inFeed || !window.frameElement?.hasAttribute("data-feed-preload"))
    return;
  return new Promise<void>((resolve) => {
    function activate(event: MessageEvent) {
      if (
        event.source !== window.parent ||
        event.origin !== location.origin ||
        event.data !== "daily-game-activate"
      )
        return;
      window.removeEventListener("message", activate);
      resolve();
    }
    window.addEventListener("message", activate);
  });
}

export function reportDaily(
  phase: DailyMessage["phase"],
  result?: string | null,
  date = dailyDate(),
) {
  if (inFeed && rushRound === null)
    window.parent.postMessage(
      { type: "daily-game", date, phase, result },
      location.origin,
    );
}

export function reportRush(phase: RushMessage["phase"], correct?: boolean) {
  if (rushRound !== null)
    window.parent.postMessage(
      { type: "rush-game", phase, correct },
      location.origin,
    );
}

let rushExpired = false;
export function rushFeedback(correct: boolean) {
  return rushExpired ? "Time’s up" : correct ? "Correct" : "Missed";
}

export function onRushActivation(activate: () => void) {
  window.addEventListener("message", (event) => {
    if (
      rushRound !== null &&
      event.origin === location.origin &&
      event.source === parent &&
      event.data === "rush-activate"
    )
      activate();
  });
}

export function onRushTimeout(reveal: () => void) {
  window.addEventListener("message", (event) => {
    if (
      event.origin === location.origin &&
      event.source === window.parent &&
      event.data === "rush-timeout"
    ) {
      rushExpired = true;
      reveal();
    }
  });
}

// The same-origin host synchronously captures the current draft at its deadline.
// Inactive frames never receive this event; the host still enforces phase/generation.
export function onRushDeadlineSubmit(submit: () => boolean | undefined) {
  if (rushRound === null) return;
  window.addEventListener("rush-submit-draft", (event) => {
    const result = (event as CustomEvent<{ correct?: boolean }>).detail;
    if (result && typeof result === "object") result.correct = submit();
  });
}
