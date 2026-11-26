import { angleBoard } from "./angle-board.js";
import {
  dailyDate,
  inFeed,
  startPractice,
  waitForFeedActivation,
  reportDaily,
  rushRound,
  rushSeed,
  reportRush,
  onRushTimeout,
  readRushDraft,
  saveRushDraft,
  rushFeedback,
  onRushActivation,
  onRushDeadlineSubmit,
} from "../daily/bridge.js";
import { showGameProgress } from "./help.js";
import {
  perceptionGames,
  perceptionPuzzle,
  perceptionGrade,
  reflect,
} from "./perception-puzzles.js";
import type { PerceptionGame, PerceptionPuzzle } from "./perception-puzzles.js";
import { acquireRushAudio } from "../daily/rush-audio.js";
const name = document.body.dataset.game!;
if (!perceptionGames.includes(name as PerceptionGame))
  throw new Error("Unknown perception game");
const game = name as PerceptionGame,
  quiz = document.querySelector<HTMLElement>("#quiz")!;
const isRush = rushRound !== null;
type Mode = "daily" | "practice";
type Phase =
  "ready" | "countdown" | "showing" | "answering" | "feedback" | "results";
type Event = "cue" | "start" | "shown" | "answer" | "next" | "reset";
// State | Event | Rule | Next: ready/start -> showing; showing/shown -> answering;
// showing or answering/answer -> feedback; feedback/next -> ready or results.
// Any/reset -> ready or results; all other events are ignored. Reset releases timers/audio.
const transitions: Record<Phase, Partial<Record<Event, Phase>>> = {
  ready: { cue: "countdown", start: "showing", reset: "ready" },
  countdown: { start: "showing", reset: "ready" },
  showing: { shown: "answering", answer: "feedback", reset: "ready" },
  answering: { answer: "feedback", reset: "ready" },
  feedback: { next: "ready", reset: "ready" },
  results: { reset: "ready" },
};
interface Answer {
  points: number;
  detail: string;
  guess: number | number[] | null;
}
interface Session {
  seed: string;
  answers: Answer[];
  draft?: number | null;
}
let day = dailyDate(),
  mode: Mode = startPractice ? "practice" : "daily",
  hard = false,
  phase: Phase = "ready";
let session: Session = { seed: day, answers: [] },
  q: PerceptionPuzzle;
let timer: ReturnType<typeof setTimeout> | undefined,
  animation = 0,
  audio: AudioContext | undefined;
let timerCallback: (() => void) | undefined,
  timerDeadline = 0,
  animateRound: (() => void) | undefined,
  pausedFor = 0;
// Host pause is independent of the puzzle phase; it freezes playback and answer deadlines.
let playback:
  { state: "running" } | { state: "paused"; since: number; remaining: number } =
  { state: "running" };
let cancelAngle: (() => void) | undefined;
let countdown = 3;
let draft = 50,
  taps: number[] = [],
  beatStart = 0,
  feedback: Answer | undefined;
// Waiting + host activation -> queued -> started. Preloading never activates playback.
// Pause freezes a queued cue. Repeated activation/resume cannot restart a stimulus.
let activation: "waiting" | "queued" | "started" | "manual" = "waiting";
const automaticRush = () =>
  isRush &&
  (game === "trackrot" ||
    game === "anglerot" ||
    game === "splitrot" ||
    (rushRound ?? 0) > 0);
function activateRush() {
  if (!automaticRush() || phase !== "ready" || activation !== "waiting") return;
  if (game === "trackrot") {
    queueBall();
    return;
  }
  activation = "queued";
  if (game === "anglerot" || game === "splitrot") start();
  else {
    draw();
    later(start, 600);
  }
}
// Ready/cue -> Countdown; ticks 3,2,1 -> Showing. Pause retains a tick;
// reset/skip cancels it. Only the visible Rush frame receives activation.
function queueBall() {
  if (document.hidden || !transition("cue")) return;
  activation = "queued";
  countdown = 3;
  draw();
  later(tickBall, 1000);
}
function tickBall() {
  if (phase !== "countdown") return;
  if (isRush && document.documentElement.hasAttribute("data-rush-paused")) {
    pausePlayback();
    later(tickBall, 1000);
    return;
  }
  countdown--;
  if (!countdown) {
    start();
    return;
  }
  draw();
  later(tickBall, 1000);
}
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};
const button = (text: string, action: () => void, kind = "secondary") => {
  const b = el("button", text, kind);
  b.type = "button";
  b.onclick = action;
  return b;
};
const key = () =>
  `dailyo:${game}:v1:${mode === "daily" ? day : `practice:${hard ? "hard" : "standard"}`}`;
function stop() {
  cancelAngle?.();
  clearTimeout(timer);
  timerCallback = undefined;
  animateRound = undefined;
  cancelAnimationFrame(animation);
  if (audio) {
    void (isRush ? audio.suspend() : audio.close()).catch(() => {});
    audio = undefined;
  }
}
function later(callback: () => void, delay: number) {
  clearTimeout(timer);
  timerCallback = callback;
  timerDeadline = performance.now() + delay;
  if (playback.state === "paused") {
    playback = { ...playback, remaining: delay };
    return;
  }
  timer = setTimeout(() => {
    timerCallback = undefined;
    callback();
  }, delay);
}
function pausePlayback() {
  cancelAngle?.();
  if (playback.state === "paused") return;
  playback = {
    state: "paused",
    since: performance.now(),
    remaining: Math.max(0, timerDeadline - performance.now()),
  };
  clearTimeout(timer);
  cancelAnimationFrame(animation);
  if (audio) void audio.suspend().catch(() => {});
}
function resumePlayback() {
  if (playback.state !== "paused") return;
  const elapsed = performance.now() - playback.since,
    remaining = playback.remaining;
  playback = { state: "running" };
  pausedFor += elapsed;
  beatStart += elapsed;
  if (audio) void audio.resume().catch(() => {});
  if (timerCallback) later(timerCallback, remaining);
  if (animateRound) animation = requestAnimationFrame(animateRound);
}
function transition(event: Event) {
  const next = transitions[phase][event];
  if (!next) return false;
  phase =
    (event === "next" || event === "reset") && session.answers.length >= count()
      ? "results"
      : next;
  if (
    phase === "ready" &&
    !isRush &&
    (game === "anglerot" || (mode === "practice" && game === "splitrot"))
  ) {
    draft = game === "anglerot" ? 0 : 50;
    transition("start");
    transition("shown");
  }
  return true;
}
function save() {
  if (isRush) return;
  try {
    localStorage.setItem(key(), JSON.stringify(session));
  } catch {}
}
function load() {
  session = {
    seed: mode === "daily" ? day : `practice:${crypto.randomUUID()}`,
    answers: [],
  };
  if (isRush) {
    session.seed = rushSeed(game);
    return;
  }
  try {
    const saved = JSON.parse(
      localStorage.getItem(key()) ?? "null",
    ) as Session | null;
    if (
      saved &&
      typeof saved.seed === "string" &&
      saved.seed.length < 100 &&
      (mode === "daily"
        ? saved.seed === day
        : saved.seed.startsWith("practice:")) &&
      Array.isArray(saved.answers) &&
      saved.answers.length <= 5 &&
      saved.answers.every(
        (a) =>
          a &&
          Number.isInteger(a.points) &&
          a.points >= 0 &&
          a.points <= 100 &&
          typeof a.detail === "string" &&
          a.detail.length < 300 &&
          (a.guess === null ||
            (typeof a.guess === "number" && Number.isFinite(a.guess)) ||
            (Array.isArray(a.guess) &&
              a.guess.length === 8 &&
              a.guess.every(Number.isFinite))),
      )
    )
      session = saved;
    if (
      session.draft !== null &&
      (typeof session.draft !== "number" ||
        !Number.isFinite(session.draft) ||
        session.draft < 0 ||
        session.draft > (mode === "practice" && hard ? 1080 : 360))
    )
      delete session.draft;
  } catch {}
}
const count = () => (isRush ? 1 : 5);
function reset() {
  stop();
  feedback = undefined;
  taps = [];
  load();
  save();
  transition("reset");
  draw();
}
function checkDate() {
  if (!isRush && day !== dailyDate()) {
    day = dailyDate();
    reset();
    return true;
  }
  return false;
}
function switchMode(next: Mode) {
  mode = next;
  reset();
}
const instructions: Record<PerceptionGame, string> = {
  countrot: "Estimate how many dots you see before they disappear.",
  trackrot: "Watch the ball, then mark where it will land.",
  anglerot: "Turn the line counterclockwise to the requested angle.",
  temporot: "Listen to four beats, then keep the rhythm for eight taps.",
  splitrot: "Mark the requested part of the line.",
};
function finish(guess: number | number[] | null) {
  if (checkDate() || !transition("answer")) return;
  stop();
  const grade =
    guess === null
      ? { points: 0, error: Infinity }
      : perceptionGrade(game, q, guess);
  const format = (n: number, digits = 1) => Number(n.toFixed(digits));
  const detail =
    guess === null
      ? "Round skipped"
      : game === "countrot"
        ? `${q.target} dots · Your estimate: ${guess}`
        : game === "trackrot"
          ? `${format(grade.error * 100)}% of the field off`
          : game === "anglerot"
            ? `${format(grade.error)}° off`
            : game === "temporot"
              ? `${Math.round(grade.error)} ms average timing error`
              : `${format(grade.error * 100)} percentage points off`;
  feedback = { ...grade, detail, guess };
  delete session.draft;
  session.answers.push(feedback);
  save();
  draw();
  quiz.querySelector<HTMLElement>("#perception-feedback")?.focus();
  if (isRush) reportRush("answered", grade.points >= 70);
  return grade.points >= 70;
}
function canvas() {
  const c = el("canvas", undefined, "perception-field");
  c.width = 960;
  c.height = 560;
  c.setAttribute("role", "img");
  c.setAttribute(
    "aria-label",
    game === "countrot"
      ? "Dot field"
      : game === "trackrot"
        ? "Ball flight and landing field"
        : "Angle dial",
  );
  return c;
}
function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 4,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function ball(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r = 10,
  color = "#eeeef0",
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
}
function track(c: HTMLCanvasElement, t: number, reveal = false) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 960, 560);
  line(ctx, 40, 500, 920, 500, "#7d8088");
  const position = (progress: number) => ({
    x: 40 + reflect(q.start + q.velocity * progress) * 880,
    y: 80 + 420 * progress - 200 * Math.sin(Math.PI * progress),
  });
  if (reveal) {
    ctx.setLineDash([8, 8]);
    for (let p = 0; p < 1; p += 0.01) {
      const a = position(p),
        b = position(Math.min(1, p + 0.01));
      line(ctx, a.x, a.y, b.x, b.y, "#7d8088", 2);
    }
    ctx.setLineDash([]);
    ball(ctx, 40 + q.target * 880, 500, 12, "#86d6a0");
  }
  if (t < 0.55) {
    const p = position(t);
    ball(ctx, p.x, p.y);
  }
  if (phase !== "showing") {
    line(ctx, 40 + draft * 8.8, 478, 40 + draft * 8.8, 524, "#f39b85", 5);
  }
}
function slider(
  label: string,
  min: number,
  max: number,
  value: number,
  change: (value: number) => void,
) {
  const wrap = el("div", undefined, "perception-control");
  const id = "perception-input";
  const l = el("label", label);
  l.htmlFor = id;
  const input = el("input");
  input.id = id;
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = "0.1";
  input.value = String(value);
  input.oninput = () => change(Number(input.value));
  wrap.append(l, input);
  return wrap;
}
function start() {
  // The host marks Pause synchronously; its message can arrive after a queued cue.
  if (isRush && document.documentElement.hasAttribute("data-rush-paused")) {
    pausePlayback();
    later(start, 0);
    return;
  }
  if (checkDate() || !transition("start")) return;
  activation = "started";
  pausedFor = 0;
  draft = game === "countrot" ? 20 : game === "anglerot" ? 0 : 50;
  taps = [];
  draw();
  if (game === "countrot" || game === "trackrot") {
    const c = quiz.querySelector("canvas")!,
      ctx = c.getContext("2d")!,
      begin = performance.now();
    const moving =
      q.hard && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animated = game === "trackrot" || moving;
    const duration = game === "countrot" ? 1100 : 1300;
    const animate = () => {
      const elapsed = performance.now() - begin - pausedFor;
      ctx.clearRect(0, 0, 960, 560);
      if (game === "countrot")
        for (const dot of q.dots)
          ball(
            ctx,
            40 +
              reflect(dot.x + (moving ? (dot.dx * elapsed) / 1000 : 0)) * 880,
            40 +
              reflect(dot.y + (moving ? (dot.dy * elapsed) / 1000 : 0)) * 480,
            8,
          );
      else track(c, elapsed / 2400);
      if (animated && elapsed < duration)
        animation = requestAnimationFrame(animate);
    };
    // Showing/static paints once. Showing/moving owns a frame loop; Pause
    // cancels it and Resume re-arms it only while the stimulus can move.
    animateRound = animated ? animate : undefined;
    animate();
    later(() => {
      if (transition("shown")) {
        cancelAnimationFrame(animation);
        animateRound = undefined;
        draw();
        quiz.querySelector<HTMLInputElement>("input")?.focus();
      }
    }, duration);
  } else if (game === "temporot") void startAudio();
  else {
    transition("shown");
    draw();
    quiz.querySelector<HTMLInputElement>("input")?.focus();
  }
}
async function startAudio() {
  let attempt: AudioContext | undefined;
  try {
    audio = isRush ? acquireRushAudio() : new AudioContext();
    const currentAudio = audio;
    attempt = currentAudio;
    const resumed = audio.resume();
    // A browser may require another gesture for audio in a newly displayed frame.
    // Keep a working control available rather than waiting on a suspended context.
    const enable =
      isRush && audio.state === "suspended"
        ? button(
            "Enable sound",
            () => {
              void currentAudio.resume();
            },
            "primary",
          )
        : null;
    if (enable) quiz.append(enable);
    await resumed;
    enable?.remove();
    if (phase !== "showing" || audio !== currentAudio) return;
    const when = audio.currentTime + 0.15;
    beatStart =
      (playback.state === "paused" ? playback.since : performance.now()) + 150;
    quiz.querySelector(".tempo-status")!.textContent =
      "Listen to the four reference beats…";
    for (let i = 0; i < 4; i++) {
      const tone = (offset: number, volume: number) => {
        const osc = currentAudio.createOscillator(),
          gain = currentAudio.createGain(),
          at = when + offset / 1000;
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(volume, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
        osc.connect(gain);
        gain.connect(currentAudio.destination);
        osc.start(at);
        osc.stop(at + 0.08);
      };
      tone(i * q.interval, 0.3);
      if (q.hard && i < 3) tone((i + 0.5) * q.interval, 0.08);
    }
    later(
      () => {
        if (!transition("shown")) return;
        draw();
        quiz.querySelector<HTMLElement>("#tap")?.focus();
        later(() => finish(taps.length === 8 ? taps : null), q.interval * 10);
      },
      150 + 3 * q.interval + 100,
    );
  } catch {
    if (attempt && audio !== attempt) return;
    stop();
    activation = "manual";
    transition("reset");
    draw();
    quiz.prepend(
      el(
        "p",
        "Sound could not start. Check your audio settings and try again.",
        "feedback",
      ),
    );
  }
}
function tap() {
  if (phase !== "answering" || game !== "temporot") return;
  taps.push(performance.now() - beatStart);
  const status = quiz.querySelector("#tap-progress");
  if (status) status.textContent = `${taps.length} of 8 taps`;
  if (taps.length === 8) finish(taps);
}
function drawRound() {
  const i = session.answers.length - (phase === "feedback" ? 1 : 0);
  q = perceptionPuzzle(
    game,
    session.seed,
    isRush ? rushRound! : i,
    mode === "practice" && hard,
  );
  showGameProgress(
    isRush ? undefined : el("p", `${i + 1} of ${count()}`, "rot-counter"),
  );
  const titles: Record<PerceptionGame, string> = {
    countrot: "How many dots?",
    trackrot: "Where will it land?",
    anglerot: "Set the angle",
    temporot: "Keep the beat",
    splitrot: "Split the line",
  };
  const title = el("h2", titles[game]);
  title.id = "question-title";
  title.tabIndex = -1;
  quiz.append(title);
  if (game === "trackrot" && (phase === "ready" || phase === "countdown")) {
    if (phase === "ready" && isRush) return;
    const field = el("div", undefined, "perception-field track-cue");
    if (phase === "countdown") {
      const cue = el("span", String(countdown), "track-countdown");
      cue.setAttribute("role", "status");
      cue.setAttribute("aria-label", `Starting in ${countdown}`);
      field.append(cue);
    }
    quiz.append(field);
    return;
  }
  if (phase === "ready") {
    quiz.append(el("p", instructions[game], "perception-note"));
    if (q.hard)
      quiz.append(
        el(
          "p",
          game === "countrot"
            ? "The dots move."
            : game === "trackrot"
              ? "The ball bounces off the side walls."
              : game === "anglerot"
                ? "Include every full turn."
                : game === "temporot"
                  ? "Tap halfway between the beats."
                  : "The fraction extends beyond the line.",
          "perception-note",
        ),
      );
    if (game === "temporot")
      quiz.append(
        el("p", "Turn on sound. Use Tap or the Space key.", "perception-note"),
      );
    if (automaticRush() && activation !== "manual")
      quiz.append(el("p", "Starting…", "perception-note"));
    else quiz.append(button("Start round", start, "primary"));
    return;
  }
  const reveal = phase === "feedback";
  if (game === "countrot") {
    if (phase === "showing" || reveal) {
      const c = canvas();
      quiz.append(c);
      if (reveal)
        for (const dot of q.dots)
          ball(c.getContext("2d")!, 40 + dot.x * 880, 40 + dot.y * 480, 8);
    }
    if (phase === "answering") {
      const form = el("form", undefined, "perception-control"),
        label = el("label", "How many dots?"),
        input = el("input");
      input.type = "number";
      input.id = "dot-count";
      input.min = "1";
      input.max = "100";
      input.required = true;
      input.inputMode = "numeric";
      label.htmlFor = input.id;
      const submit = el("button", "Check estimate", "primary");
      submit.type = "submit";
      form.onsubmit = (e) => {
        e.preventDefault();
        finish(Number(input.value));
      };
      form.append(label, input, submit);
      quiz.append(form);
    }
  } else if (game === "trackrot") {
    const c = canvas();
    quiz.append(c);
    track(c, 1, reveal);
    if (phase === "answering") {
      const pick = (value: number) => {
        if (
          phase !== "answering" ||
          !c.isConnected ||
          playback.state === "paused" ||
          document.documentElement.hasAttribute("data-rush-paused")
        )
          return;
        const input =
          quiz.querySelector<HTMLInputElement>("#perception-input")!;
        input.value = String(value);
        draft = Number(input.value);
        track(c, 1);
      };
      quiz.append(slider("Landing position", 0, 100, draft, pick));
      c.style.touchAction = "none";
      c.onpointerdown = (e) => {
        c.setPointerCapture(e.pointerId);
        pick(
          Math.max(
            0,
            Math.min(
              100,
              (((e.clientX - c.getBoundingClientRect().left) / c.clientWidth) *
                960 -
                40) /
                8.8,
            ),
          ),
        );
      };
      c.onpointermove = (e) => {
        if (c.hasPointerCapture(e.pointerId))
          pick(
            Math.max(
              0,
              Math.min(
                100,
                (((e.clientX - c.getBoundingClientRect().left) /
                  c.clientWidth) *
                  960 -
                  40) /
                  8.8,
              ),
            ),
          );
      };
      quiz.append(
        button("Check landing", () => finish(draft / 100), "primary"),
      );
    }
  } else if (game === "anglerot") {
    title.textContent = `${q.target}°`;
    title.classList.add("angle-target");
    const value = () =>
      reveal
        ? typeof feedback?.guess === "number"
          ? feedback.guess
          : null
        : (session.draft ?? null);
    const clear = button("Clear", () => change(null));
    const check = button(
      "Check angle",
      () => {
        const guess = value();
        if (guess !== null) finish(guess);
      },
      "primary",
    );
    const turns = el("span", undefined, "angle-turns");
    const turnLabel = (angle: number | null) => {
      const count = Math.floor((angle ?? 0) / 360);
      return `${count} full turn${count === 1 ? "" : "s"}`;
    };
    const change = (next: number | null) => {
      if (phase !== "answering" || playback.state === "paused") return;
      session.draft = next;
      save();
      board.refresh();
      check.disabled = next === null;
      clear.disabled = next === null;
      turns.textContent = turnLabel(next);
    };
    const board = angleBoard({
      target: q.target,
      value,
      change,
      editable: () => phase === "answering" && playback.state === "running",
      reveal,
      max: q.hard ? 1080 : 360,
    });
    cancelAngle = board.cancel;
    quiz.append(board.canvas);
    if (!reveal) {
      const actions = el("div", undefined, "angle-actions");
      clear.disabled = check.disabled = value() === null;
      if (q.hard) {
        turns.textContent = turnLabel(value());
        const turnControls = el("div", undefined, "angle-turn-controls");
        turnControls.append(
          button("Remove turn", () =>
            change(Math.max(0, (value() ?? 0) - 360)),
          ),
          turns,
          button("Add turn", () =>
            change(Math.min(1080, (value() ?? 0) + 360)),
          ),
        );
        actions.append(turnControls);
      }
      actions.append(clear, check);
      quiz.append(actions);
    }
  } else if (game === "splitrot") {
    quiz.append(
      el(
        "p",
        `Mark ${Math.round(q.target * 100)}% from the ${q.right ? "right" : "left"} endpoint.`,
        "perception-target",
      ),
    );
    const field = el("div", undefined, "split-field");
    field.setAttribute("role", "group");
    field.setAttribute("aria-label", "Reference line with selection");
    const base = el("div", undefined, "split-line"),
      left = el("span", "Left", "split-left"),
      right = el("span", "Right", "split-right"),
      marker = el("span", undefined, "split-marker");
    const coordinate = (value: number) => (q.hard ? (100 + value) / 3 : value);
    const position = (guess: number) => {
      marker.style.left = `${coordinate(guess)}%`;
    };
    field.append(base, left, right, marker);
    field.dataset.extended = String(q.hard);
    position(draft);
    quiz.append(field);
    if (reveal) {
      const answer = el("span", undefined, "split-marker split-answer");
      answer.style.left = `${coordinate((q.right ? 1 - q.target : q.target) * 100)}%`;
      field.append(answer);
    }
    if (phase === "answering") {
      quiz.append(
        slider(
          "Split position",
          q.hard ? -100 : 0,
          q.hard ? 200 : 100,
          draft,
          (value) => {
            draft = value;
            position(value);
          },
        ),
      );
      field.style.touchAction = "none";
      const pick = (e: PointerEvent) => {
        const fraction =
          (e.clientX - field.getBoundingClientRect().left) / field.clientWidth;
        draft = q.hard
          ? Math.max(-100, Math.min(200, (fraction * 3 - 1) * 100))
          : Math.max(0, Math.min(100, fraction * 100));
        position(draft);
        quiz.querySelector<HTMLInputElement>("input")!.value = String(draft);
      };
      field.onpointerdown = (e) => {
        field.setPointerCapture(e.pointerId);
        pick(e);
      };
      field.onpointermove = (e) => {
        if (field.hasPointerCapture(e.pointerId)) pick(e);
      };
      quiz.append(
        button(
          "Check split",
          () => finish(q.right ? 1 - draft / 100 : draft / 100),
          "primary",
        ),
      );
    }
  } else {
    if (phase === "showing")
      quiz.append(el("p", "Starting sound…", "tempo-status"));
    if (phase === "answering") {
      const progress = el("p", "0 of 8 taps", "tempo-status");
      progress.id = "tap-progress";
      const b = button("Tap", tap, "primary tempo-tap");
      b.id = "tap";
      quiz.append(progress, b);
    }
  }
  if (reveal && feedback) {
    const box = el("div", undefined, "perception-feedback");
    box.setAttribute("role", "status");
    const h = el(
      "h3",
      isRush
        ? rushFeedback(feedback.points >= 70, true)
        : `${feedback.points} / 100 points`,
    );
    h.id = "perception-feedback";
    h.tabIndex = -1;
    if (game === "anglerot") {
      h.className = "screen-reader-only";
      box.classList.add("angle-feedback");
    }
    box.append(h, el("p", feedback.detail));
    if (game === "anglerot" && isRush)
      box.append(
        el("span", `${feedback.points} / 100 points`, "screen-reader-only"),
      );
    if (isRush && feedback.guess !== null && game !== "anglerot")
      box.append(
        el(
          "p",
          `${feedback.points} / 100 · 70 needed to continue`,
          "perception-note",
        ),
      );
    quiz.append(box);
    if (!isRush)
      quiz.append(
        button(
          session.answers.length === count() ? "See results" : "Next",
          () => {
            if (!transition("next")) return;
            feedback = undefined;
            draw();
            quiz
              .querySelector<HTMLElement>("#question-title, .result h2")
              ?.focus();
          },
          "primary",
        ),
      );
  } else if (!isRush && (phase === "showing" || phase === "answering"))
    quiz.append(
      button("Skip round", () => finish(null), "secondary perception-skip"),
    );
}
function drawResults() {
  showGameProgress();
  const result = el("div", undefined, "result"),
    total = session.answers.reduce((n, a) => n + a.points, 0),
    h = el("h2", `${total} / 500 points`);
  h.tabIndex = -1;
  const list = el("ol", undefined, "perception-recap");
  for (const a of session.answers)
    list.append(el("li", `${a.points} / 100 · ${a.detail}`));
  result.append(h, list);
  const status = el("p");
  status.setAttribute("role", "status");
  result.append(
    button("Copy results", () => {
      const text = `${game} ${mode === "daily" ? day : "Practice"}${hard && mode === "practice" ? " · Hard" : ""}\n${total} / 500 points\n${session.answers.map((a, i) => `${i + 1}. ${a.points}/100`).join("\n")}\n${location.origin}/${game}/`;
      void navigator.clipboard
        .writeText(text)
        .then(() => (status.textContent = "Results copied."))
        .catch(() => {
          const textArea = el("textarea");
          textArea.value = text;
          textArea.setAttribute("aria-label", "Results to copy");
          result.append(textArea);
          textArea.select();
        });
    }),
  );
  result.append(
    button(
      mode === "daily" ? "Play practice" : "New set",
      () => {
        if (mode === "daily") switchMode("practice");
        else {
          session = { seed: `practice:${crypto.randomUUID()}`, answers: [] };
          save();
          reset();
        }
      },
      "primary",
    ),
    status,
  );
  quiz.append(result);
  reportDaily("complete", `${total} / 500 points`, day);
}
function draw() {
  cancelAngle?.();
  cancelAngle = undefined;
  quiz.replaceChildren();
  quiz.classList.toggle("angle-playfield", game === "anglerot");
  for (const control of document.querySelectorAll<HTMLButtonElement>(
    ".modes button",
  ))
    control.setAttribute("aria-pressed", String(control.id === mode));
  const settings = document.querySelector<HTMLElement>("#perception-settings");
  if (settings) settings.hidden = mode !== "practice" || inFeed;
  if (phase === "results") drawResults();
  else {
    drawRound();
    reportDaily("playing", undefined, day);
    if (game === "trackrot" && !isRush && phase === "ready" && !document.hidden)
      queueBall();
  }
}
async function init() {
  await waitForFeedActivation();
  load();
  save();
  transition("reset");
  if (isRush) {
    const saved = readRushDraft<{
      phase: Phase;
      draft: number | null;
      count?: string;
    }>();
    if (
      saved?.phase === "answering" &&
      ((game === "anglerot" && saved.draft === null) ||
        (typeof saved.draft === "number" &&
          Number.isFinite(saved.draft) &&
          saved.draft >= 0 &&
          saved.draft <= (game === "anglerot" ? 360 : 100))) &&
      game !== "temporot"
    ) {
      transition("start");
      transition("shown");
      if (game === "anglerot") session.draft = saved.draft;
      else draft = saved.draft!;
    }
    saveRushDraft(() => ({
      phase,
      draft: game === "anglerot" ? (session.draft ?? null) : draft,
      count: quiz.querySelector<HTMLInputElement>("#dot-count")?.value,
    }));
  }
  for (const control of document.querySelectorAll<HTMLButtonElement>(
    ".modes button",
  ))
    control.onclick = () =>
      switchMode(control.id === "practice" ? "practice" : "daily");
  if (!inFeed) {
    const settings = el("div", undefined, "perception-settings");
    settings.id = "perception-settings";
    const label = el("label", "Practice variation"),
      select = el("select");
    select.id = "variation";
    label.htmlFor = select.id;
    for (const [value, text] of [
      ["standard", "Standard"],
      ["hard", "Hard"],
    ]) {
      const option = el("option", text);
      option.value = value!;
      select.append(option);
    }
    select.onchange = () => {
      hard = select.value === "hard";
      reset();
    };
    settings.append(label, select);
    quiz.before(settings);
  }
  document.addEventListener("keydown", (e) => {
    if (
      e.code === "Space" &&
      !e.repeat &&
      game === "temporot" &&
      phase === "answering" &&
      !(e.target instanceof HTMLButtonElement)
    ) {
      e.preventDefault();
      tap();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (
      !isRush &&
      document.hidden &&
      ["countdown", "showing", "answering"].includes(phase)
    ) {
      stop();
      transition("reset");
      draw();
    } else if (!document.hidden && !checkDate() && game === "trackrot") {
      if (!isRush && phase === "ready") draw();
      else if (
        isRush &&
        window.frameElement?.hasAttribute("title") &&
        !document.documentElement.hasAttribute("data-rush-paused")
      ) {
        resumePlayback();
        if (phase === "ready") activateRush();
      }
    }
  });
  if (game === "trackrot" && !isRush) {
    const help = document.querySelector<HTMLDialogElement>("#help-dialog")!;
    new MutationObserver(() =>
      help.open ? pausePlayback() : resumePlayback(),
    ).observe(help, { attributes: true, attributeFilter: ["open"] });
  }
  window.addEventListener("message", (event) => {
    if (!isRush || event.source !== parent || event.origin !== location.origin)
      return;
    if (event.data === "rush-pause") pausePlayback();
    if (event.data === "rush-resume") resumePlayback();
  });
  // The host marks suspension before posting its playback message. Cancel the
  // gesture at that boundary, even if resume arrives before message delivery.
  if (isRush)
    new MutationObserver(() => {
      cancelAngle?.();
      if (game === "trackrot") {
        if (document.documentElement.hasAttribute("data-rush-paused"))
          pausePlayback();
        else resumePlayback();
      }
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-rush-paused"],
    });
  window.addEventListener("blur", () => cancelAngle?.());
  window.addEventListener("pagehide", () =>
    game === "trackrot" ? pausePlayback() : stop(),
  );
  window.addEventListener("pageshow", (event) => {
    if (checkDate()) return;
    if (game === "trackrot" && event.persisted && !isRush && !document.hidden) {
      resumePlayback();
      if (phase === "ready") draw();
    }
  });
  setInterval(() => checkDate(), 30000);
  onRushActivation(activateRush);
  onRushDeadlineSubmit(() => {
    if (game !== "trackrot") return undefined;
    if (phase === "answering") return finish(draft / 100);
    if (phase === "feedback" && feedback && feedback.guess !== null)
      return feedback!.points >= 70;
    return undefined;
  });
  onRushTimeout(() => {
    if (phase === "feedback") {
      draw();
      return;
    }
    if (phase === "ready" || phase === "countdown") transition("start");
    finish(null);
  });
  draw();
  const countDraft = readRushDraft<{ count?: string }>()?.count;
  if (
    typeof countDraft === "string" &&
    /^\d{0,3}$/.test(countDraft) &&
    quiz.querySelector<HTMLInputElement>("#dot-count")
  )
    quiz.querySelector<HTMLInputElement>("#dot-count")!.value = countDraft;
  if (isRush) reportRush("ready");
}
void init();
