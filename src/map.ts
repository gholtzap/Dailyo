import { designValue } from "./design.js";
import type {
  Coordinate,
  Network,
  Boroughs,
  Station,
  Challenge,
  Ride,
  Assessment,
} from "./types.js";
const NS = "http://www.w3.org/2000/svg";
function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
  text?: string,
) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([key, value]) =>
    node.setAttribute(key, String(value)),
  );
  if (text) node.textContent = text;
  return node;
}
export function createMap(
  svg: SVGSVGElement,
  boroughs: Boroughs,
  network: Network,
) {
  const inset = Number.parseFloat(designValue("--space-2"));
  const labelCenter = Number.parseFloat(designValue("--space-4"));
  const labelSide = Number.parseFloat(designValue("--space-10"));
  const labelFar = Number.parseFloat(designValue("--space-20"));
  const labelReserve = Number.parseFloat(designValue("--space-8"));
  const labelMinimum = Number.parseFloat(designValue("--size-72"));
  const labelMaximum = Number.parseFloat(designValue("--size-240"));
  const city = network.metadata.city;
  const mapName = city?.name ?? network.metadata.mapName ?? "New York City";
  const project = ([lon, lat]: Coordinate): Coordinate =>
    city && city.slug !== "nyc"
      ? [
          (lon - city.lon) * 6000 * Math.cos((city.lat * Math.PI) / 180),
          (city.lat - lat) * 6000,
        ]
      : [(lon + 74.15) * 4500, (40.94 - lat) * 5940];
  const path = (points: Coordinate[]) =>
    points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${project(p)
            .map((x) => x.toFixed(2))
            .join(",")}`,
      )
      .join("");
  const overlay = document.createElement("div");
  overlay.className = "map-labels";
  overlay.setAttribute("aria-hidden", "true");
  svg.after(overlay);
  const labels: { node: HTMLElement; point: Coordinate }[] = [];
  function addLabel(title: string, coordinates: Coordinate, className: string) {
    const node = document.createElement("span");
    node.className = className;
    node.textContent = title;
    overlay.append(node);
    labels.push({ node, point: project(coordinates) });
  }
  const land = el("g");
  if (city && city.slug !== "nyc")
    land.append(
      el("rect", {
        x: -100000,
        y: -100000,
        width: 200000,
        height: 200000,
        fill: "var(--map-land)",
      }),
    );
  for (const feature of boroughs.features) {
    land.append(
      el("path", {
        d: feature.geometry.coordinates
          .map((poly) => poly.map((ring) => path(ring) + "Z").join(""))
          .join(""),
        fill:
          feature.properties?.kind === "water"
            ? "var(--map-water)"
            : feature.properties?.kind === "park"
              ? "var(--map-park)"
              : "var(--map-land)",
        stroke: "var(--map-shore)",
        "stroke-width": 1,
        "vector-effect": "non-scaling-stroke",
        "fill-rule": "evenodd",
      }),
    );
  }
  svg.append(land);
  if (!network.metadata.mapName && (!city || city.slug === "nyc")) {
    const parks: [string, Coordinate[], Coordinate][] = [
      [
        "Central Park",
        [
          [-73.9819, 40.7681],
          [-73.973, 40.7644],
          [-73.9495, 40.8005],
          [-73.9585, 40.8043],
          [-73.9819, 40.7681],
        ],
        [-73.9655, 40.7838],
      ],
      [
        "Prospect Park",
        [
          [-73.978, 40.6724],
          [-73.9706, 40.671],
          [-73.9627, 40.66],
          [-73.9677, 40.6523],
          [-73.9817, 40.659],
          [-73.978, 40.6724],
        ],
        [-73.972, 40.6615],
      ],
    ];
    for (const [name, points, label] of parks) {
      svg.append(
        el("path", {
          d: path(points) + "Z",
          fill: "var(--map-park)",
          stroke: "var(--map-park-edge)",
          "stroke-width": 0.8,
        }),
      );
      addLabel(name, label, "map-place park-place");
    }
    for (const [name, lon, lat] of [
      ["Manhattan", -73.981, 40.816],
      ["Brooklyn", -73.964, 40.636],
      ["Queens", -73.872, 40.75],
      ["The Bronx", -73.886, 40.84],
      ["Staten Island", -74.16, 40.59],
    ] as [string, number, number][])
      addLabel(name, [lon, lat], "map-place borough-place");
    for (const [name, lon, lat] of [
      ["Hudson River", -74.02, 40.785],
      ["East River", -73.963, 40.738],
      ["Upper Bay", -74.045, 40.658],
    ] as [string, number, number][])
      addLabel(name, [lon, lat], "map-place water-place");
  }
  const networkLayer = el("g", { "aria-hidden": "true" }),
    userLayer = el("g", { "aria-hidden": "true", "data-route-layer": "yours" }),
    bestLayer = el("g", { "aria-hidden": "true" });
  const markers: { node: HTMLElement; point: Coordinate }[] = [];
  svg.append(networkLayer, userLayer, bestLayer);
  let view = [280, 550, 950, 850],
    home = [...view],
    shownNetwork = false,
    currentChallenge: Challenge | null = null;
  function setView(next: number[]) {
    view = next;
    svg.setAttribute("viewBox", view.join(" "));
    const rect = svg.getBoundingClientRect(),
      scale = Math.min(rect.width / view[2], rect.height / view[3]);
    const pixel = ([x, y]: Coordinate) => [
      (rect.width - view[2] * scale) / 2 + (x - view[0]) * scale,
      (rect.height - view[3] * scale) / 2 + (y - view[1]) * scale,
    ];
    const obstructions = [
      ...svg.parentElement!.querySelectorAll(".map-caption"),
    ]
      .filter((n) => n.getClientRects().length)
      .map((n) => n.getBoundingClientRect());
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right + inset &&
      a.right > b.left - inset &&
      a.top < b.bottom + inset &&
      a.bottom > b.top - inset;
    const fits = (box: DOMRect) =>
      box.left >= rect.left + inset &&
      box.right <= rect.right - inset &&
      box.top >= rect.top + inset &&
      box.bottom <= rect.bottom - inset;
    const occupied = [...obstructions];
    // Position the anchors first; names must clear both station badges.
    for (const { node, point } of markers) {
      const [x, y] = pixel(point);
      node.style.left = x + "px";
      node.style.top = y + "px";
      node.hidden = false;
      node.hidden =
        !fits(node.getBoundingClientRect()) ||
        obstructions.some((o) => overlaps(node.getBoundingClientRect(), o));
      if (!node.hidden) occupied.push(node.getBoundingClientRect());
    }
    for (const { node, point } of markers) {
      const name = node.querySelector<HTMLElement>(".map-marker-name")!;
      name.hidden = true;
      if (node.hidden) continue;
      const [x, y] = pixel(point),
        preferLeft = x > rect.width / 2;
      const sides = preferLeft ? ["left", "right"] : ["right", "left"];
      const placements = [
        ...sides.map((side) => ({ side, offset: 0 })),
        { side: "above", offset: 0 },
        { side: "below", offset: 0 },
        ...[-labelSide, labelSide, -labelFar, labelFar].flatMap((offset) =>
          sides.map((side) => ({ side, offset })),
        ),
      ];
      for (const { side, offset } of placements) {
        const horizontal = side === "left" || side === "right";
        const available = horizontal
          ? (side === "left" ? x : rect.width - x) - labelReserve
          : rect.width - labelCenter;
        if (available < labelMinimum) continue;
        name.style.maxWidth = Math.min(labelMaximum, available) + "px";
        name.style.right = "auto";
        name.style.left =
          side === "left"
            ? -inset + "px"
            : side === "right"
              ? labelSide + "px"
              : labelCenter + "px";
        name.style.top =
          side === "above"
            ? -inset + "px"
            : side === "below"
              ? labelSide + "px"
              : labelCenter + offset + "px";
        name.style.transform =
          side === "left"
            ? "translate(-100%,-50%)"
            : side === "right"
              ? "translateY(-50%)"
              : side === "above"
                ? "translate(-50%,-100%)"
                : "translateX(-50%)";
        name.hidden = false;
        const box = name.getBoundingClientRect();
        if (fits(box) && !occupied.some((o) => overlaps(box, o))) {
          occupied.push(box);
          break;
        }
        name.hidden = true;
      }
    }
    // Geography yields to station names and to other place labels.
    for (const { node, point } of labels) {
      const [x, y] = pixel(point);
      node.style.left = x + "px";
      node.style.top = y + "px";
      node.hidden = false;
    }
    const boxes = labels.map(({ node }) => node.getBoundingClientRect());
    for (const [index, { node }] of labels.entries()) {
      const box = boxes[index];
      node.hidden = !fits(box) || occupied.some((o) => overlaps(box, o));
      if (!node.hidden) occupied.push(box);
    }
  }

  function fit(challenge: Challenge, extra: Coordinate[] = []) {
    const a = network.stations[challenge.from],
      b = network.stations[challenge.to];
    const points = (
      [[a.lon, a.lat], [b.lon, b.lat], ...extra] as Coordinate[]
    ).map(project);
    const ax = Math.min(...points.map((p) => p[0])),
      ay = Math.min(...points.map((p) => p[1])),
      bx = Math.max(...points.map((p) => p[0])),
      by = Math.max(...points.map((p) => p[1]));
    const rect = svg.getBoundingClientRect();
    // Keep endpoint badges clear of the top control and bottom attribution.
    const top = 88,
      bottom = city ? 112 : 72,
      side = 28;
    const scale = Math.min(
      rect.width / 420,
      rect.height / 440,
      (rect.width - 2 * side) / Math.max(bx - ax, 1),
      Math.max(1, rect.height - top - bottom) / Math.max(by - ay, 1),
    );
    const width = rect.width / scale,
      height = rect.height / scale;
    const centerY = (ay + by) / 2 - (top - bottom) / (2 * scale);
    home = [(ax + bx) / 2 - width / 2, centerY - height / 2, width, height];
    setView([...home]);
  }
  function marker(
    station: Station,
    badge: string,
    title: string,
    color: string,
  ) {
    const node = document.createElement("div");
    node.className = "map-marker";
    const circle = document.createElement("span");
    circle.className = "map-marker-badge";
    circle.textContent = badge;
    circle.style.background = color;
    circle.style.color = "var(--color-canvas)";
    const name = document.createElement("span");
    name.className = "map-marker-name";
    name.textContent = title;
    node.append(circle, name);
    overlay.append(node);
    markers.push({ node, point: project([station.lon, station.lat]) });
  }
  function setChallenge(challenge: Challenge) {
    pointers.clear();
    gesture = null;
    currentChallenge = challenge;
    markers.forEach(({ node }) => node.remove());
    markers.length = 0;
    userLayer.replaceChildren();
    bestLayer.replaceChildren();
    networkLayer.style.display = "none";
    shownNetwork = false;
    marker(
      network.stations[challenge.from],
      "A",
      challenge.fromTitle,
      "var(--map-origin)",
    );
    marker(
      network.stations[challenge.to],
      "B",
      challenge.toTitle,
      "var(--yellow)",
    );
    fit(challenge);
    svg.setAttribute(
      "aria-label",
      `${mapName} map. Start at ${challenge.fromTitle}; finish at ${challenge.toTitle}. ${city ? "Rail" : "Subway"} lines are hidden.`,
    );
  }
  function drawLegs(layer: SVGGElement, legs: Ride[], dashed = false) {
    layer.replaceChildren();
    for (const leg of legs) {
      const color = "#" + network.routes[leg.route].color;
      const p = network.patterns[leg.patternIndex];
      const points = p.geometry.slice(
        p.offsets[leg.start],
        p.offsets[leg.end] + 1,
      );
      if (points.length < 2) continue;
      layer.append(
        el("path", {
          d: path(points),
          fill: "none",
          stroke: "var(--map-route-halo)",
          "stroke-width": 8,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "vector-effect": "non-scaling-stroke",
        }),
      );
      layer.append(
        el("path", {
          d: path(points),
          fill: "none",
          stroke: color,
          "stroke-width": 4,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "vector-effect": "non-scaling-stroke",
          ...(dashed ? { "stroke-dasharray": "8 5" } : {}),
          class: "route-path",
        }),
      );
      for (const id of [
        leg.walkBefore?.to ?? leg.from,
        leg.walkAfter?.from ?? leg.to,
      ]) {
        const s = network.stations[id],
          [x, y] = project([s.lon, s.lat]);
        layer.append(
          el("circle", {
            cx: x,
            cy: y,
            r: 4,
            fill: "var(--map-route-halo)",
            stroke: color,
            "stroke-width": 2,
            "vector-effect": "non-scaling-stroke",
          }),
        );
      }
    }
  }
  function showNetwork() {
    if (!network.metadata.mapName && (!city || city.slug === "nyc")) return;
    if (shownNetwork) return;
    shownNetwork = true;
    if (currentChallenge)
      svg.setAttribute(
        "aria-label",
        `${mapName} map. Start at ${currentChallenge.fromTitle}; finish at ${currentChallenge.toTitle}. ${city ? "Rail" : "Subway"} lines are shown.`,
      );
    networkLayer.style.display = "";
    if (networkLayer.childElementCount) return;
    const seen = new Set();
    for (const p of network.patterns) {
      const key = p.route + ":" + p.stations.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      networkLayer.append(
        el("path", {
          d: path(p.geometry),
          fill: "none",
          stroke: "#" + network.routes[p.route].color,
          "stroke-width": 1.5,
          opacity: 0.55,
          "vector-effect": "non-scaling-stroke",
        }),
      );
    }
  }
  function reveal(result: Assessment) {
    drawLegs(userLayer, result.legs);
    drawLegs(bestLayer, result.optimal?.legs ?? [], true);
    const points = [...result.legs, ...(result.optimal?.legs ?? [])].flatMap(
      (l) => {
        const p = network.patterns[l.patternIndex];
        return p.geometry.slice(p.offsets[l.start], p.offsets[l.end] + 1);
      },
    );
    if (currentChallenge) fit(currentChallenge, points);
    svg.setAttribute(
      "aria-label",
      `Route comparison on the ${mapName} map. Your route is solid; the fastest route is dashed. Train colors identify each line. Text directions appear beside the map.`,
    );
  }
  function filter(value: string) {
    userLayer.style.display = value === "best" ? "none" : "";
    bestLayer.style.display = value === "yours" ? "none" : "";
    if (userLayer.childElementCount || bestLayer.childElementCount)
      svg.setAttribute(
        "aria-label",
        value === "yours"
          ? `Your ${city ? "rail" : "subway"} route on the ${mapName} map. Open Route details for directions.`
          : value === "best"
            ? `The fastest ${city ? "rail" : "subway"} route on the ${mapName} map. Directions are in the result.`
            : `Route comparison on the ${mapName} map. Your route is solid; the fastest route is dashed. Train colors identify each line. Directions are in the result.`,
      );
  }
  // Idle -> pan (one pointer) -> pinch (two pointers). Rebase when fingers
  // enter or leave, so continuing with one finger never jumps to an old origin.
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { view: number[]; anchor: Coordinate; distance: number } | null =
    null;
  function worldAt(point: { x: number; y: number }, v = view): Coordinate {
    const rect = svg.getBoundingClientRect(),
      scale = Math.min(rect.width / v[2], rect.height / v[3]);
    return [
      v[0] + (point.x - rect.left - (rect.width - v[2] * scale) / 2) / scale,
      v[1] + (point.y - rect.top - (rect.height - v[3] * scale) / 2) / scale,
    ];
  }
  function measure() {
    const [a, b] = [...pointers.values()];
    return b
      ? {
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          distance: Math.hypot(a.x - b.x, a.y - b.y),
        }
      : { center: a, distance: 0 };
  }
  function beginGesture() {
    if (!pointers.size) {
      gesture = null;
      return;
    }
    const { center, distance } = measure();
    gesture = { view: [...view], anchor: worldAt(center), distance };
  }
  function place(
    anchor: Coordinate,
    point: { x: number; y: number },
    v: number[],
    factor: number,
  ) {
    const rect = svg.getBoundingClientRect();
    factor = Math.max(140 / v[2], Math.min(3000 / v[2], factor));
    const w = v[2] * factor,
      h = v[3] * factor,
      scale = Math.min(rect.width / w, rect.height / h);
    setView([
      anchor[0] - (point.x - rect.left - (rect.width - w * scale) / 2) / scale,
      anchor[1] - (point.y - rect.top - (rect.height - h * scale) / 2) / scale,
      w,
      h,
    ]);
  }
  function zoom(factor: number, point?: { x: number; y: number }) {
    const rect = svg.getBoundingClientRect();
    point ??= { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    place(worldAt(point), point, view, factor);
    beginGesture();
  }
  svg.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    svg.setPointerCapture(event.pointerId);
    beginGesture();
  });
  svg.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const { center, distance } = measure();
    place(
      gesture.anchor,
      center,
      gesture.view,
      gesture.distance > 0 && distance > 0 ? gesture.distance / distance : 1,
    );
  });
  function endPointer(event: Event) {
    if (!pointers.delete((event as PointerEvent).pointerId)) return;
    beginGesture();
  }
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    svg.addEventListener(event, endPointer);
  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(
        Math.exp(
          Math.max(
            -1,
            Math.min(1, event.deltaY * (event.ctrlKey ? 0.01 : 0.002)),
          ),
        ),
        { x: event.clientX, y: event.clientY },
      );
    },
    { passive: false },
  );
  svg.addEventListener("dblclick", (event) => {
    event.preventDefault();
    zoom(0.5, { x: event.clientX, y: event.clientY });
  });
  svg.addEventListener("keydown", (event) => {
    const shift = view[2] * 0.08,
      offset = (
        {
          ArrowLeft: [-shift, 0],
          ArrowRight: [shift, 0],
          ArrowUp: [0, -shift],
          ArrowDown: [0, shift],
        } as Record<string, number[]>
      )[event.key];
    if (offset) {
      event.preventDefault();
      setView([view[0] + offset[0], view[1] + offset[1], view[2], view[3]]);
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.8);
    }
    if (event.key === "-") {
      event.preventDefault();
      zoom(1.25);
    }
    if (event.key === "Home") {
      event.preventDefault();
      setView([...home]);
    }
  });
  const resize = new ResizeObserver(() => setView(view));
  for (const node of [
    svg,
    ...svg.parentElement!.querySelectorAll(".map-caption"),
  ])
    resize.observe(node);
  document.fonts.ready.then(() => setView(view));
  return { setChallenge, reveal, filter, showNetwork };
}
