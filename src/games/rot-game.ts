import { designValue } from "../design.js";
import type { Mode, RotGame, Coordinate } from "../types.js";
import type {
  RotData,
  RotState,
  RotSession,
  RotAction,
  Place,
  YearQuestion,
  YearEvent,
  Country,
  BorderGeometry,
} from "./rot-types.js";
import { element, required } from "../dom.js";
type Content = (HTMLElement | SVGElement | null)[];
import { showGameProgress } from "./help.js";
import {
  makeSet,
  newSession,
  phase,
  preparePuzzles,
  rankingPuzzle,
  restoreSession,
  roundCount,
  scoreAnswer,
  scoreSet,
  transition,
} from "./rot-puzzles.js";
import {
  dailyDate as today,
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
} from "../daily/bridge.js";
import { showRank } from "../daily/rank.js";
import {
  searchCountries,
  exactCountryMatch,
  automaticCountryMatch,
} from "./country-search.js";
import {
  parseDifficulty,
  practiceSettings,
  practiceSlot,
} from "./difficulty.js";
import type { PracticeDifficulty } from "./difficulty.js";

const kind = document.body.dataset.game as RotGame;
const quiz = required("#quiz");
const modes = [
  ...document.querySelectorAll<HTMLButtonElement>(".modes button"),
];
const key = (part: string) =>
  `dailyo:${kind}:${kind === "borderrot" && part !== "mode" ? "v2" : "v1"}:${part}`;
const read = (part: string): RotState | null => {
  try {
    return JSON.parse(
      localStorage.getItem(key(part)) ?? "null",
    ) as RotState | null;
  } catch {
    return null;
  }
};
const write = (part: string, value: RotState | Mode | PracticeDifficulty) => {
  try {
    localStorage.setItem(key(part), JSON.stringify(value));
  } catch {}
};
function readMode(): Mode | null {
  try {
    return JSON.parse(
      localStorage.getItem(key("mode")) ?? "null",
    ) as Mode | null;
  } catch {
    return null;
  }
}
const randomSeed = () => String(crypto.randomUUID?.() ?? Math.random());
const number = new Intl.NumberFormat("en");
const mapGame = kind === "maprot";
const yearGame = kind === "yearrot";
const sessions = {} as Record<Mode, RotSession>;
let mode: Mode =
  startPractice || (!inFeed && readMode() === "practice")
    ? "practice"
    : "daily";
let difficulty = parseDifficulty(read("difficulty"));
let settings: ReturnType<typeof practiceSettings> | undefined;
let data: RotData,
  day: string,
  borderGeometry: {
    paths: [string, Path2D][];
    anchors: Record<string, Coordinate>;
  } | null;
let mapObserver: ResizeObserver | undefined;
let mapGeometry: BorderGeometry | null = null;
let countryNames = new Map<string, string>();

function button(text: string, callback: () => void, className = "secondary") {
  const node = element("button", text, className);
  node.type = "button";
  node.onclick = callback;
  return node;
}

function mountSession(
  slot: string,
  seed: string,
  level: PracticeDifficulty = "standard",
): RotSession {
  const questions = makeSet(kind, data, seed, 0, level);
  return {
    slot,
    questions,
    state: restoreSession(kind, data, questions, read(slot), seed),
  };
}

function resetDay() {
  const nextDay = today();
  if (nextDay === day) return;
  day = nextDay;
  sessions.daily = mountSession(`daily:${day}`, day);
  if (mode === "daily") draw();
}

function selectMode(next: Mode) {
  mode = next;
  write("mode", mode);
  resetDay();
  draw();
}

function update(action: RotAction, paint = true) {
  const session = sessions[mode];
  const next = transition(kind, data, session.questions, session.state, action);
  if (next === session.state) return false;
  session.state = next;
  if (rushRound !== null) {
    if (paint) draw();
    if (phase(next) === "review") {
      const score = scoreAnswer(kind, session.questions[0], next.answers[0]);
      reportRush("answered", mapGame ? score <= 500 : score === 1);
    }
    return true;
  }
  write(session.slot!, next);
  if (paint) draw();
  if (paint && phase(next) === "review")
    document.querySelector<HTMLElement>(".rot-next")?.focus();
  if (action.type === "next")
    document.querySelector<HTMLElement>("#round-title")?.focus();
  return true;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attrs))
    node.setAttribute(name, String(value));
  return node;
}

function marker(point: number[], type: string, radius = 3.1) {
  return svg("circle", {
    cx: point[0] + 180,
    cy: 90 - point[1],
    r: radius,
    class: `rot-pin ${type}`,
  });
}

function zoomToPins(
  map: SVGSVGElement,
  guess: Coordinate,
  [lon, lat]: Coordinate,
) {
  // Place the guess on the nearest copy of the world when the points straddle the date line.
  const guessLon = lon + ((guess[0] - lon + 540) % 360) - 180;
  const x1 = guessLon + 180,
    y1 = 90 - guess[1];
  const x2 = lon + 180,
    y2 = 90 - lat;
  const width = Math.max(
    12,
    Math.abs(x2 - x1) * 1.24,
    Math.abs(y2 - y1) * 2.48,
  );
  const height = width / 2;
  const left = (x1 + x2 - width) / 2;
  const top = (y1 + y2 - height) / 2;
  map.setAttribute("viewBox", `${left} ${top} ${width} ${height}`);
  map.classList.add("rot-zoomed");
  for (const shift of [-360, 360]) {
    if (shift < 0 ? left >= 0 : left + width <= 360) continue;
    const wrappedLand = map.firstElementChild!.cloneNode(true) as SVGElement;
    wrappedLand.setAttribute("transform", `translate(${shift} 0)`);
    wrappedLand.setAttribute("data-map-wrap", String(shift));
    map.append(wrappedLand);
  }
  map.append(
    svg("line", { x1, y1, x2, y2, class: "rot-connector" }),
    marker([lon, lat], "answer", width / 115),
    marker([guessLon, guess[1]], "guess", width / 80),
  );
}

// Great-circle contours use the same spherical Earth radius as distanceKm.
function distanceRings(
  map: SVGSVGElement,
  target: Coordinate,
  distance: number,
) {
  if (!distance) return;
  const rad = Math.PI / 180,
    lat = target[1] * rad,
    lon = target[0] * rad;
  const rings = svg("g", {
    class: "rot-distance-rings",
    "aria-hidden": "true",
  });
  for (const fraction of [0.25, 0.5, 1]) {
    const km = distance * fraction,
      angular = km / 6371;
    let path = "",
      previous: number | undefined;
    for (let i = 0; i <= 360; i++) {
      const bearing = i * rad;
      const latitude = Math.asin(
        Math.sin(lat) * Math.cos(angular) +
          Math.cos(lat) * Math.sin(angular) * Math.cos(bearing),
      );
      const longitude =
        lon +
        Math.atan2(
          Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
          Math.cos(angular) - Math.sin(lat) * Math.sin(latitude),
        );
      const x =
        target[0] + ((longitude / rad - target[0] + 540) % 360) - 180 + 180;
      const y = 90 - latitude / rad;
      path += `${previous === undefined || Math.abs(x - previous) > 180 ? "M" : "L"}${x.toFixed(4)},${y.toFixed(4)}`;
      previous = x;
    }
    rings.append(
      svg("path", {
        d: path,
        "data-distance-km": km,
        class: "rot-distance-ring",
      }),
    );
  }
  map.insertBefore(rings, map.querySelector(".rot-connector"));
}

function coordinates([lon, lat]: number[], digits = 1) {
  return `${Math.abs(lat).toFixed(digits)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(digits)}° ${lon < 0 ? "W" : "E"}`;
}

function drawMap(
  question: Place,
  state: RotState,
  reviewing: boolean,
): Content {
  const [city, country, lon, lat] = question;
  const heading = element(
    "h2",
    reviewing ? `${city}, ${country}` : `Find ${city}`,
  );
  const map = svg("svg", {
    viewBox: "0 0 360 180",
    class: reviewing ? "rot-map rot-reviewing" : "rot-map rot-picking",
    role: "group",
    "aria-label": reviewing
      ? `Map answer showing your pin and ${city}. Arrow keys pan; plus and minus zoom.`
      : "World map. Arrow keys move the pin; hold Shift for finer adjustment.",
    tabindex: 0,
  });
  const geography = svg("g", { "aria-hidden": "true" });
  geography.append(
    svg("path", {
      d: (data as Extract<RotData, { kind: "maprot" }>).land,
      class: "rot-land",
      "fill-rule": "evenodd",
    }),
  );
  map.append(geography);
  if (mapGeometry) {
    const outlines = svg("g", {
      class: "rot-country-outlines",
      transform: "translate(180 90)",
      "aria-hidden": "true",
    });
    for (const [, d] of mapGeometry.paths)
      outlines.append(
        svg("path", {
          d,
          class: "rot-country-outline",
          "fill-rule": "evenodd",
        }),
      );
    geography.append(outlines);
  }
  const labels = element("div", undefined, "rot-map-labels");
  labels.setAttribute("aria-hidden", "true");
  const surface = element("div", undefined, "rot-map-surface");
  surface.append(map, labels);
  const feedback = element("div", undefined, "rot-feedback");
  feedback.setAttribute("role", "status");
  const guess = reviewing
    ? (state.answers[state.index] as Coordinate | null)
    : null;
  if (reviewing) {
    if (guess) {
      zoomToPins(map, guess, [lon, lat]);
      distanceRings(map, [lon, lat], scoreAnswer(kind, question, guess));
      feedback.append(
        element(
          "p",
          `${number.format(scoreAnswer(kind, question, guess))} km away`,
        ),
        element(
          "p",
          `Your pin: ${coordinates(guess)}. ${city}, ${country}.`,
          "screen-reader-only",
        ),
      );
    } else {
      map.append(marker([lon, lat], "answer"));
      feedback.append(
        element("p", `${city}, ${country} · ${coordinates([lon, lat])}`),
      );
    }
  }

  const pointLabel = element(
    "p",
    state.draft.length
      ? `Your pin: ${coordinates(state.draft as number[], 2)}`
      : "Tap to place a pin. Drag the map to pan or drag the pin to adjust.",
    "rot-coordinate",
  );
  pointLabel.setAttribute("role", "status");
  const dialog = element("dialog", undefined, "rot-map-dialog");
  dialog.setAttribute("aria-label", reviewing ? "Map answer" : "Find the city");
  const header = element("div", undefined, "rot-map-dialog-heading");
  header.append(
    element("h2", reviewing ? `${city}, ${country}` : `Find ${city}`),
    button("Close", () => dialog.close()),
  );
  dialog.append(header);
  const inline = element("div"),
    editor = element("div", undefined, "rot-map-editor");
  const submit = button(
    "Check pin",
    () => {
      if (dialog.open) dialog.close();
      update({ type: "submit" });
    },
    "primary",
  );
  submit.disabled = !state.draft.length;
  let pin =
    !reviewing && state.draft.length
      ? marker(state.draft as number[], "guess")
      : null;
  if (pin) map.append(pin);
  const fitted = map.viewBox.baseVal;
  const initial = {
    zoom: 360 / fitted.width,
    center: { x: fitted.x + fitted.width / 2, y: fitted.y + fitted.height / 2 },
  };
  let zoom = initial.zoom,
    center = { ...initial.center };
  const maxZoom = reviewing ? 64 : 16;
  function viewSize() {
    const box = map.getBoundingClientRect(),
      aspect = box.width && box.height ? box.width / box.height : 2;
    const width = Math.max(360, 180 * aspect) / zoom;
    return { width, height: width / aspect };
  }
  function renderView() {
    const { width, height } = viewSize();
    center.x = reviewing
      ? Math.max(-180, Math.min(540, center.x))
      : width >= 360
        ? 180
        : Math.max(width / 2, Math.min(360 - width / 2, center.x));
    center.y =
      height >= 180
        ? 90
        : Math.max(height / 2, Math.min(180 - height / 2, center.y));
    map.setAttribute(
      "viewBox",
      `${center.x - width / 2} ${center.y - height / 2} ${width} ${height}`,
    );
    if (reviewing)
      for (const shift of [-360, 360]) {
        const needed =
          shift < 0 ? center.x - width / 2 < 0 : center.x + width / 2 > 360;
        const existing = map.querySelector(`[data-map-wrap="${shift}"]`);
        if (!needed) {
          existing?.remove();
          continue;
        }
        if (!existing) {
          const copy = geography.cloneNode(true) as SVGElement;
          copy.setAttribute("transform", `translate(${shift} 0)`);
          copy.setAttribute("data-map-wrap", String(shift));
          map.insertBefore(
            copy,
            map.querySelector(".rot-distance-rings, .rot-connector, .rot-pin"),
          );
        }
      }
    if (pin)
      pin.setAttribute(
        "r",
        String((5 * width) / (map.getBoundingClientRect().width || 360)),
      );
    for (const marker of map.querySelectorAll(".rot-pin"))
      marker.setAttribute(
        "r",
        String((5 * width) / (map.getBoundingClientRect().width || 360)),
      );
    labels.replaceChildren();
    const matrix = map.getScreenCTM(),
      surfaceBox = surface.getBoundingClientRect();
    const screenPoint = (x: number, y: number) => {
      const point = matrix
        ? new DOMPoint(x, y).matrixTransform(matrix)
        : new DOMPoint();
      return { x: point.x - surfaceBox.x, y: point.y - surfaceBox.y };
    };
    const scale = width / (map.getBoundingClientRect().width || 360),
      font = 12 * scale;
    if (zoom >= 2 && mapGeometry) {
      const occupied: { x: number; y: number; width: number }[] = [];
      for (const [id, [x, y]] of Object.entries(mapGeometry.anchors)) {
        const name = countryNames.get(id);
        if (!name) continue;
        const point = { x: x + 180, y: y + 90 },
          labelWidth = name.length * font * 0.52;
        if (
          reviewing &&
          Math.hypot(point.x - (lon + 180), point.y - (90 - lat)) < font * 5
        )
          continue;
        if (
          point.x - labelWidth / 2 < center.x - width / 2 ||
          point.x + labelWidth / 2 > center.x + width / 2 ||
          point.y - font < center.y - height / 2 ||
          point.y + font > center.y + height / 2
        )
          continue;
        if (
          occupied.some(
            (p) =>
              Math.abs(p.y - point.y) < font * 1.8 &&
              Math.abs(p.x - point.x) < (p.width + labelWidth) / 2 + font,
          )
        )
          continue;
        const label = element("span", name, "rot-country-label");
        const screen = screenPoint(point.x, point.y);
        label.style.left = `${screen.x}px`;
        label.style.top = `${screen.y}px`;
        labels.append(label);
        occupied.push({ ...point, width: labelWidth });
      }
    }
    if (reviewing) {
      const point = screenPoint(lon + 180, 90 - lat);
      if (
        point.x >= 0 &&
        point.x <= surfaceBox.width &&
        point.y >= 0 &&
        point.y <= surfaceBox.height
      ) {
        const label = element("span", city, "rot-city-label");
        labels.append(label);
        const size = label.getBoundingClientRect();
        const inset = Number.parseFloat(designValue("--space-2"));
        label.style.left = `${Math.max(inset, Math.min(surfaceBox.width - size.width - inset, point.x + inset))}px`;
        label.style.top = `${Math.max(inset, Math.min(surfaceBox.height - size.height - inset, point.y - size.height - inset))}px`;
      }
    }
    zoomIn.disabled = zoom >= maxZoom;
    zoomOut.disabled = zoom <= 1;
  }
  function setZoom(
    value: number,
    anchor?: { x: number; y: number },
    client?: { x: number; y: number },
  ) {
    zoom = Math.max(1, Math.min(maxZoom, value));
    if (anchor && client) {
      const box = map.getBoundingClientRect(),
        size = viewSize();
      center = {
        x:
          anchor.x -
          ((client.x - box.left - box.width / 2) * size.width) / box.width,
        y:
          anchor.y -
          ((client.y - box.top - box.height / 2) * size.height) / box.height,
      };
    } else if (pin)
      center = {
        x: Number(pin.getAttribute("cx")),
        y: Number(pin.getAttribute("cy")),
      };
    renderView();
  }
  const tools = element("div", undefined, "rot-map-tools");
  const zoomIn = button("Zoom in", () => setZoom(zoom * 2)),
    zoomOut = button("Zoom out", () => setZoom(zoom / 2));
  const reset = button(reviewing ? "Fit answer" : "Reset view", () => {
    zoom = initial.zoom;
    center = { ...initial.center };
    renderView();
  });
  const enlarge = button("Enlarge map", () => {
    dialog.append(editor);
    enlarge.hidden = true;
    dialog.showModal();
    renderView();
    map.focus();
  });
  dialog.addEventListener("close", () => {
    if (!inline.isConnected) return;
    inline.append(editor);
    enlarge.hidden = false;
    renderView();
    enlarge.focus();
  });
  tools.append(zoomIn, zoomOut, reset, enlarge);
  const actions = element("div", undefined, "rot-actions");
  actions.append(submit);
  editor.append(
    surface,
    tools,
    ...(reviewing ? [feedback] : [pointLabel, actions]),
  );
  inline.append(editor);
  mapObserver = new ResizeObserver(() => renderView());
  mapObserver.observe(map);

  function move(point: number[], follow = false) {
    const bounded = point.map(
      (value, index) =>
        Math.round(
          Math.max(-[180, 90][index], Math.min([180, 90][index], value)) * 100,
        ) / 100,
    );
    if (!update({ type: "position", point: bounded }, false)) return;
    pin?.remove();
    pin = marker(bounded, "guess");
    map.append(pin);
    pointLabel.textContent = `Your pin: ${coordinates(bounded, 2)}`;
    submit.disabled = false;
    if (follow) center = { x: bounded[0] + 180, y: 90 - bounded[1] };
    renderView();
  }
  function locationAt(client: { x: number; y: number }) {
    const matrix = map.getScreenCTM();
    return matrix
      ? new DOMPoint(client.x, client.y).matrixTransform(matrix.inverse())
      : null;
  }
  type Point = { x: number; y: number };
  type Gesture =
    | {
        type: "drag";
        start: Point;
        center: Point;
        pin: boolean;
        moved: boolean;
      }
    | { type: "pinch"; distance: number; zoom: number; anchor: Point };
  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;
  const midpoint = (a: Point, b: Point) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  map.onpointerdown = (event) => {
    if (event.button !== 0) return;
    map.setPointerCapture(event.pointerId);
    map.focus({ preventScroll: true });
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()],
        anchor = locationAt(midpoint(a, b));
      if (anchor)
        gesture = {
          type: "pinch",
          distance: Math.max(1, distance(a, b)),
          zoom,
          anchor,
        };
    } else if (pointers.size === 1) {
      const matrix = map.getScreenCTM(),
        p =
          pin && matrix
            ? new DOMPoint(
                Number(pin.getAttribute("cx")),
                Number(pin.getAttribute("cy")),
              ).matrixTransform(matrix)
            : null;
      gesture = {
        type: "drag",
        start: point,
        center: { ...center },
        pin: !reviewing && !!p && distance(point, p) < 22,
        moved: false,
      };
    }
  };
  map.onpointermove = (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);
    if (gesture.type === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      setZoom(
        (gesture.zoom * distance(a, b)) / gesture.distance,
        gesture.anchor,
        midpoint(a, b),
      );
    } else if (gesture.type === "drag") {
      if (distance(point, gesture.start) > 4) gesture.moved = true;
      if (!gesture.moved) return;
      if (gesture.pin) {
        const p = locationAt(point);
        if (p) move([p.x - 180, 90 - p.y]);
      } else {
        const box = map.getBoundingClientRect(),
          size = viewSize();
        center = {
          x:
            gesture.center.x -
            ((point.x - gesture.start.x) * size.width) / box.width,
          y:
            gesture.center.y -
            ((point.y - gesture.start.y) * size.height) / box.height,
        };
        renderView();
      }
    }
  };
  function release(event: PointerEvent, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    if (
      !reviewing &&
      !cancelled &&
      gesture?.type === "drag" &&
      !gesture.moved
    ) {
      const p = locationAt({ x: event.clientX, y: event.clientY });
      const edge = (2 * viewSize().width) / map.clientWidth;
      if (
        p &&
        p.x >= -edge &&
        p.x <= 360 + edge &&
        p.y >= -edge &&
        p.y <= 180 + edge
      )
        move([p.x - 180, 90 - p.y]);
    }
    pointers.delete(event.pointerId);
    gesture = null;
    if (map.hasPointerCapture(event.pointerId))
      map.releasePointerCapture(event.pointerId);
  }
  map.onpointerup = (event) => release(event);
  map.onpointercancel = (event) => release(event, true);
  map.onlostpointercapture = (event) => {
    pointers.delete(event.pointerId);
    gesture = null;
  };
  map.onwheel = (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const client = { x: event.clientX, y: event.clientY },
      anchor = locationAt(client);
    if (anchor) setZoom(zoom * Math.exp(-event.deltaY * 0.01), anchor, client);
  };
  map.onkeydown = (event) => {
    if (reviewing) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom(zoom * 2);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom(zoom / 2);
        return;
      }
      const direction = (
        {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        } as Record<string, number[]>
      )[event.key];
      if (direction) {
        event.preventDefault();
        const size = viewSize();
        center = {
          x: center.x + direction[0] * size.width * 0.1,
          y: center.y + direction[1] * size.height * 0.1,
        };
        renderView();
      }
      return;
    }
    const shift = (
      {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      } as Record<string, number[]>
    )[event.key];
    if (!Array.isArray(shift)) return;
    event.preventDefault();
    const point = sessions[mode].state.draft as number[];
    const step = (event.shiftKey ? 0.1 : 1) / zoom;
    move(
      shift.map(
        (direction, index) =>
          ((point[index] as number) ?? 0) + direction * step,
      ),
      true,
    );
  };
  return [heading, inline, dialog];
}

function drawTimeline(
  question: YearQuestion,
  state: RotState,
  reviewing: boolean,
): Content {
  const { event, timeline } = question;
  const heading = element("h2", event[1], "rot-year-event");
  const board = element("div", undefined, "timeline-playfield");
  board.tabIndex = 0;
  board.setAttribute("role", "region");
  board.setAttribute("aria-label", "Timeline board; scroll to explore");
  const list = element("ol", undefined, "rot-timeline");
  list.setAttribute("aria-label", "Timeline");
  const addEvent = ([year, description]: YearEvent, highlight = false) => {
    const row = element(
      "li",
      undefined,
      `rot-event${highlight ? " highlight" : ""}`,
    );
    const date = element("time", String(year));
    date.dateTime = String(year);
    row.append(date, element("span", description));
    list.append(row);
  };
  if (reviewing) {
    const correct = scoreAnswer(kind, question, state.answers[state.index]);
    const feedback = element(
      "p",
      `${correct ? "Correct placement" : "Correct year"} · ${event[0]}`,
      "rot-feedback",
    );
    feedback.setAttribute("role", "status");
    for (const item of [...timeline, event].sort((a, b) => a[0] - b[0]))
      addEvent(item, item === event);
    board.append(list);
    return [heading, feedback, board];
  }
  for (const item of timeline) addEvent(item);
  const choices = element("div", undefined, "rot-year-choices");
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", "Choose when it happened");
  for (let slot = 0; slot <= timeline.length; slot++) {
    const earlier = timeline[slot - 1],
      later = timeline[slot];
    const label = !earlier
      ? `Before ${later[0]}`
      : !later
        ? `After ${earlier[0]}`
        : `Between ${earlier[0]} and ${later[0]}`;
    choices.append(
      button(
        label,
        () => update({ type: "place", slot }),
        "secondary rot-slot",
      ),
    );
  }
  board.append(list);
  return [heading, board, choices];
}

function drawBorderMap(
  start: string,
  target: string,
  guesses: string[],
  choose?: (id: string) => void,
) {
  if (!borderGeometry) return null;
  const { paths, anchors } = borderGeometry;
  const selected = new Set([start, ...guesses]);
  const points = [...selected, target].map((id) => anchors[id]);
  const xs = points.map(([x]) => x),
    ys = points.map(([, y]) => y);
  const west = Math.min(...xs),
    east = Math.max(...xs);
  const north = Math.min(...ys),
    south = Math.max(...ys);
  const width = Math.max(
    26,
    (east - west) * 1.4 + 12,
    (south - north) * 2.8 + 12,
  );
  const height = width / 2;
  const left = (west + east - width) / 2;
  const top = (north + south - height) / 2;
  const panel = element("div", undefined, "border-map");
  const map = element("canvas", undefined, "rot-map");
  map.width = 1440;
  map.height = 720;
  const context = map.getContext("2d")!;
  const scale = map.width / width;
  context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
  const paint = {
    border: designValue("--color-map-country-border"),
    selected: designValue("--color-map-country-selected"),
    target: designValue("--color-map-country-target"),
    country: designValue("--color-map-country"),
  };
  context.strokeStyle = paint.border;
  context.lineWidth = 2.4 / scale;
  for (const [id, path] of paths) {
    context.fillStyle = selected.has(id)
      ? paint.selected
      : id === target
        ? paint.target
        : paint.country;
    context.fill(path, "evenodd");
  }
  for (const [, path] of paths) context.stroke(path);
  if (choose) {
    map.classList.add("border-selectable");
    map.setAttribute("role", "img");
    map.setAttribute(
      "aria-label",
      "Route map. Click a country to add it, or use Add a country below.",
    );
    map.onclick = (event) => {
      const rect = map.getBoundingClientRect();
      const x = ((event.clientX - rect.left) * map.width) / rect.width;
      const y = ((event.clientY - rect.top) * map.height) / rect.height;
      // Hit-test the same transformed paths used for painting the map.
      const hit = [...paths]
        .reverse()
        .find(([, path]) => context.isPointInPath(path, x, y, "evenodd"));
      if (hit) choose(hit[0]);
    };
  }
  panel.append(map);
  for (const id of new Set([start, target, ...guesses])) {
    const [x, y] = anchors[id];
    const guessed = guesses.includes(id);
    const name = guessed
      ? (data as Extract<RotData, { kind: "borderrot" }>).graph.get(id)!.name
      : undefined;
    const marker = element("span", undefined, "border-marker");
    marker.setAttribute("aria-hidden", "true");
    marker.style.left = `${((x - left) / width) * 100}%`;
    marker.style.top = `${((y - top) / height) * 100}%`;
    marker.classList.toggle("border-destination", !selected.has(id));
    if (name) marker.title = name;
    if (id === guesses.at(-1)) {
      marker.append(element("span", name, "border-map-label"));
      marker.classList.toggle("border-label-left", x > left + width / 2);
    }
    panel.append(marker);
  }
  if (!choose) panel.setAttribute("aria-hidden", "true");
  return panel;
}

function drawBorders(
  question: string[],
  state: RotState,
  reviewing: boolean,
): Content {
  const start = question[0],
    target = question.at(-1)!;
  const name = (id: string) =>
    (data as Extract<RotData, { kind: "borderrot" }>).graph.get(id)!.name;
  const heading = element("h2", `${name(start)} to ${name(target)}`);
  const chain = (countries: string[], title: string) => {
    const list = element("ol", undefined, "rot-chain");
    list.setAttribute("aria-label", title);
    for (const country of countries) list.append(element("li", name(country)));
    return list;
  };
  if (reviewing) {
    const path = state.answers[state.index] as string[] | null;
    const best = question.length - 1;
    const correct = scoreAnswer(kind, question, path);
    const feedback = element(
      "p",
      path === null
        ? `One shortest route crosses ${best} borders.`
        : correct
          ? `Shortest route · ${best} borders`
          : `Your route crossed ${path.length} borders. A shortest route crosses ${best}.`,
      "rot-feedback",
    );
    feedback.setAttribute("role", "status");
    const map = drawBorderMap(start, target, path ?? question.slice(1));
    if (correct || !path)
      return [
        heading,
        map,
        feedback,
        chain(path ? [start, ...path] : question, "Shortest route"),
      ];
    return [
      heading,
      map,
      chain([start, ...path], "Your route"),
      feedback,
      chain(question, "Shortest route"),
    ];
  }

  const selected = [start, ...(state.draft as string[])];
  const last = selected.at(-1)!;
  const label = element("label", "Add a country", "rot-search-label");
  label.htmlFor = "country-search";
  const input = element("input", undefined, "country-search");
  input.id = "country-search";
  input.type = "search";
  input.autocomplete = "off";
  const choices = element("div", undefined, "choices rot-choices");
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", "Matching countries");
  const feedback = element("p", undefined, "rot-feedback");
  feedback.setAttribute("role", "status");
  feedback.id = "country-feedback";
  input.setAttribute("aria-describedby", feedback.id);
  const atlas = [
    ...(data as Extract<RotData, { kind: "borderrot" }>).graph.values(),
  ];
  const countries = atlas
    .filter((country) => !selected.includes(country.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  let matches: Country[] = [];

  function add(country: Country) {
    if (!update({ type: "add", country: country.id })) {
      feedback.textContent = selected.includes(country.id)
        ? `${country.name} is already in your route.`
        : `${country.name} and ${name(last)} don’t share a land border in this game.`;
      input.setAttribute("aria-invalid", "true");
      input.focus({ preventScroll: true });
      feedback.scrollIntoView({ block: "nearest" });
    } else if (phase(sessions[mode].state) === "guess")
      document.querySelector<HTMLElement>("#country-search")!.focus();
  }

  let composing = false;
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    search();
  });
  function search() {
    const query = input.value.trim();
    feedback.textContent = "";
    input.removeAttribute("aria-invalid");
    matches = searchCountries(countries, query);
    choices.replaceChildren(
      ...matches.map((country) =>
        button(country.name, () => add(country), "choice"),
      ),
    );
    if (query && !matches.length) choices.append(element("p", "No matches"));
    const automatic = !composing && automaticCountryMatch(atlas, query);
    if (automatic && !selected.includes(automatic.id)) add(automatic);
  }
  input.oninput = search;
  input.onkeydown = (event) => {
    if (event.key !== "Enter" || composing || event.isComposing) return;
    event.preventDefault();
    const exactMatches = matches.filter((country) =>
      exactCountryMatch(country, input.value),
    );
    const exact = exactMatches.length === 1 ? exactMatches[0] : undefined;
    if (exact || matches.length === 1) {
      add(exact ?? matches[0]);
    }
  };

  const actions = element("div", undefined, "rot-actions");
  if (state.draft.length)
    actions.append(
      button("Undo last country", () => {
        update({ type: "undo" });
        document.querySelector<HTMLElement>("#country-search")!.focus();
      }),
    );
  actions.append(button("Show shortest route", () => update({ type: "skip" })));
  return [
    heading,
    drawBorderMap(start, target, state.draft as string[], (id) => {
      const country = atlas.find((country) => country.id === id);
      if (country) add(country);
    }),
    chain(selected, "Your route"),
    label,
    input,
    feedback,
    choices,
    actions,
  ];
}

function questionReview(session: RotSession, scores: number[]) {
  const review = element("ol", undefined, "rot-recap");
  review.setAttribute("aria-label", "Review completed questions");
  session.questions.forEach((question, index) => {
    const row = element("li");
    const details = element("details");
    const title = mapGame
      ? (question as Place)[0]
      : yearGame
        ? (question as YearQuestion).event[1]
        : (question as string[])
            .filter((_, i, array) => i === 0 || i === array.length - 1)
            .map(
              (id) =>
                (data as Extract<RotData, { kind: "borderrot" }>).graph.get(id)!
                  .name,
            )
            .join(" to ");
    const score = mapGame
      ? `${number.format(scores[index])} km away`
      : session.state.answers[index] === null
        ? "Answer shown"
        : scores[index]
          ? "Correct"
          : "Missed";
    const summary = element("summary");
    summary.append(
      element("span", title),
      element("span", score, "rot-recap-score"),
    );
    details.append(summary);
    // Render a review only when opened; keep the saved result and score read-only.
    details.ontoggle = () => {
      if (!details.open || details.childElementCount > 1) return;
      const state = { ...session.state, index };
      const content = mapGame
        ? drawMap(question as Place, state, true)
        : yearGame
          ? drawTimeline(question as YearQuestion, state, true)
          : drawBorders(question as string[], state, true);
      const panel = element("div", undefined, "rot-recap-detail");
      panel.append(
        ...content
          .slice(1)
          .filter((node): node is HTMLElement | SVGElement => node !== null),
      );
      details.append(panel);
    };
    row.append(details);
    review.append(row);
  });
  const section = element("section", undefined, "rot-review");
  const heading = element("h3", "Review answers");
  heading.id = "review-title";
  section.setAttribute("aria-labelledby", heading.id);
  section.append(heading, review);
  return section;
}

function summary(session: RotSession): Content {
  const { scores, total } = scoreSet(
    kind,
    session.questions,
    session.state.answers,
  );
  const title = element(
    "h2",
    mapGame
      ? `${number.format(total)} km off`
      : `${total} out of ${roundCount}`,
  );
  const content: HTMLElement[] = [title];
  if (mode === "daily") {
    const rank = element("div", undefined, "daily-rank");
    showRank(
      rank,
      {
        game: kind,
        day,
        puzzle: rankingPuzzle(kind, session.questions),
        answers: session.state.answers,
      },
      total,
    );
    content.push(rank);
  }
  content.push(questionReview(session, scores));
  if (inFeed) return content;
  const actions = element("div", undefined, "rot-actions");
  const footer = element("div");
  if (mode === "daily") {
    const text = [
      `${kind} ${day}`,
      mapGame ? `${title.textContent} across five cities` : title.textContent,
      mapGame
        ? scores.map((score) => `${number.format(score)} km`).join(" · ")
        : scores.map((score) => (score ? "🟩" : "⬛")).join(""),
      new URL(location.pathname, "https://trainrot.vercel.app").href,
    ].join("\n");
    const status = element("p", undefined, "rot-feedback");
    status.setAttribute("role", "status");
    actions.append(
      button("Copy results", async () => {
        try {
          await navigator.clipboard.writeText(text);
          status.textContent = "Copied results.";
        } catch {
          const label = element("label", "Results to copy");
          label.htmlFor = "results-to-copy";
          const copy = element("textarea", undefined, "rot-copy");
          copy.id = "results-to-copy";
          copy.value = text;
          copy.readOnly = true;
          status.replaceChildren(label, copy);
          copy.focus();
          copy.select();
        }
      }),
    );
    actions.append(
      button(
        "Play practice",
        () => {
          selectMode("practice");
          document.querySelector<HTMLElement>("#round-title")?.focus();
        },
        "primary",
      ),
    );
    footer.append(
      element("p", "Next daily set at midnight in New York.", "rot-coordinate"),
      actions,
      status,
    );
  } else {
    actions.append(
      button(
        "New set",
        () => {
          sessions.practice = mountSession(
            practiceSlot(difficulty),
            randomSeed(),
            difficulty,
          );
          write(practiceSlot(difficulty), sessions.practice.state);
          draw();
          document.querySelector<HTMLElement>("#round-title")?.focus();
        },
        "primary",
      ),
    );
    footer.append(actions);
  }
  return [...content, footer];
}

function draw() {
  mapObserver?.disconnect();
  mapObserver = undefined;
  settings?.sync(difficulty, mode === "practice");
  for (const control of modes)
    control.setAttribute("aria-pressed", String(control.id === mode));
  const session = sessions[mode];
  const { state, questions } = session;
  const current = phase(state);
  const counter = element("div", undefined, "round-head rot-counter");
  counter.append(
    element(
      "p",
      current === "complete"
        ? mode === "daily"
          ? "Daily results"
          : "Practice results"
        : `Question ${state.index + 1} of ${roundCount}`,
    ),
  );
  showGameProgress(rushRound === null ? counter : undefined);
  const question = questions[state.index];
  const content =
    current === "complete"
      ? summary(session)
      : mapGame
        ? drawMap(question as Place, state, current === "review")
        : yearGame
          ? drawTimeline(question as YearQuestion, state, current === "review")
          : drawBorders(question as string[], state, current === "review");
  const heading = content[0]!;
  heading.id = "round-title";
  heading.tabIndex = -1;
  if (current === "review" && rushRound === null) {
    const next = element("div", undefined, "rot-actions");
    next.append(
      button(
        state.index === roundCount - 1 ? "See results" : "Next",
        () => update({ type: "next" }),
        "primary rot-next",
      ),
    );
    content.push(next);
  }
  quiz.replaceChildren(
    ...content.filter(
      (node): node is HTMLElement | SVGElement => node !== null,
    ),
  );
  reportDaily(
    current === "complete" ? "complete" : "playing",
    current === "complete" ? heading.textContent : undefined,
    day,
  );
}

async function start() {
  const geometry: Promise<BorderGeometry | null> | null =
    kind === "borderrot" || mapGame
      ? fetch(`/games/data/${mapGame ? "map-geometry" : "border-map"}.json`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
      : null;
  const response = await fetch(`/games/data/${kind}.json`);
  if (!response.ok) throw new Error("Game data unavailable");
  data = preparePuzzles(kind, await response.json());
  const rawGeometry = await geometry;
  if (mapGame && rawGeometry) {
    mapGeometry = rawGeometry;
    countryNames = new Map(
      (rawGeometry as BorderGeometry & { names: [string, string][] }).names,
    );
  }
  borderGeometry =
    kind === "borderrot" && rawGeometry
      ? {
          ...rawGeometry,
          paths: rawGeometry.paths.map(([id, path]) => [id, new Path2D(path)]),
        }
      : null;
  if (rushRound !== null) {
    const seed = rushSeed(kind);
    const position = rushRound % data.items.length;
    const index = position % roundCount;
    const question = makeSet(kind, data, seed, position - index)[index];
    const saved = readRushDraft<RotState>();
    sessions.daily = {
      questions: [question],
      state:
        saved?.index === 0 &&
        Array.isArray(saved.answers) &&
        !saved.answers.length
          ? restoreSession(kind, data, [question], saved, seed)
          : newSession(seed),
    };
    saveRushDraft(() => sessions.daily.state);
    if (mapGame) {
      const rule = element("p", "Place your pin within 500 km.", "rush-rule");
      quiz.closest("main")!.querySelector(".heading")!.append(rule);
    }
    onRushTimeout(() => {
      const session = sessions.daily;
      if (phase(session.state) !== "guess") return;
      session.state = { ...session.state, answers: [null] };
      draw();
    });
    draw();
    reportRush("ready");
    return;
  }
  await waitForFeedActivation();
  const practiceSession = () => {
    const saved = read(practiceSlot(difficulty));
    const seed =
      typeof saved?.seed === "string" && saved.seed.length < 100
        ? saved.seed
        : randomSeed();
    return mountSession(practiceSlot(difficulty), seed, difficulty);
  };
  sessions.practice = practiceSession();
  write(practiceSlot(difficulty), sessions.practice.state);
  if (yearGame && !inFeed) {
    settings = practiceSettings(
      {
        easy: "Broad eras. Build your sense of history.",
        standard: "Daily difficulty. A growing timeline.",
        hard: "Nearby events. Find the finer distinctions.",
      },
      (next) => {
        if (next === difficulty) return;
        difficulty = next;
        write("difficulty", difficulty);
        sessions.practice = practiceSession();
        write(practiceSlot(difficulty), sessions.practice.state);
        draw();
      },
    );
    quiz.before(settings.element);
  }
  resetDay();
  for (const control of modes)
    control.onclick = () => selectMode(control.id as Mode);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resetDay();
  });
  setInterval(resetDay, 30_000);
  draw();
}

start().catch(() => {
  reportRush("error");
  reportDaily("error");
  const error = element("p", "The game could not load.", "rot-feedback");
  error.setAttribute("role", "alert");
  quiz.replaceChildren(
    error,
    button("Reload game", () => location.reload(), "primary"),
  );
});
