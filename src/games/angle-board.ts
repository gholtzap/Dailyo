// The board owns an in-flight gesture; the game owns the committed answer.
export function angleBoard(options: {
  target: number;
  value: () => number | null;
  change: (value: number | null) => void;
  editable: () => boolean;
  reveal: boolean;
  max: number;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 960;
  canvas.className = "angle-board";
  canvas.tabIndex = options.reveal ? -1 : 0;
  canvas.setAttribute("role", options.reveal ? "img" : "slider");
  canvas.setAttribute(
    "aria-label",
    options.reveal ? "Your ray and the target angle" : "Draw angle",
  );
  if (!options.reveal) {
    canvas.setAttribute("aria-valuemin", "0");
    canvas.setAttribute("aria-valuemax", String(options.max));
  }
  type Gesture =
    | { state: "idle" }
    | { state: "drawing"; id: number; preview: number | null };
  let gesture: Gesture = { state: "idle" };
  const ctx = canvas.getContext("2d")!;
  const radians = (a: number) => (-a * Math.PI) / 180;
  function refresh() {
    const value =
      gesture.state === "drawing" ? gesture.preview : options.value();
    ctx.clearRect(0, 0, 960, 960);
    ctx.strokeStyle = "#74777d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(480, 480, 400, 0, Math.PI * 2);
    ctx.stroke();
    const ray = (a: number, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(480, 480);
      ctx.lineTo(
        480 + 400 * Math.cos(radians(a)),
        480 + 400 * Math.sin(radians(a)),
      );
      ctx.stroke();
    };
    ray(0, "#9a9da2", 3);
    if (options.reveal && value !== null) {
      const raw = options.target - value;
      const gap = options.max > 360 ? raw : ((raw + 540) % 360) - 180;
      ctx.fillStyle = "#f39b8526";
      ctx.beginPath();
      ctx.moveTo(480, 480);
      ctx.arc(
        480,
        480,
        400,
        radians(value),
        radians(value + Math.max(-360, Math.min(360, gap))),
        gap > 0,
      );
      ctx.closePath();
      ctx.fill();
    }
    if (value !== null) ray(value, "#f39b85", 7);
    if (options.reveal) ray(options.target, "#86d6a0", 5);
    ctx.fillStyle = "#eeeef0";
    ctx.beginPath();
    ctx.arc(480, 480, 12, 0, Math.PI * 2);
    ctx.fill();
    if (!options.reveal) {
      const committed = options.value();
      canvas.setAttribute("aria-valuenow", String(committed ?? 0));
      canvas.setAttribute(
        "aria-valuetext",
        committed === null
          ? "Not drawn"
          : `${Number(committed.toFixed(1))} degrees`,
      );
    }
  }
  const position = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) * 960) / box.width - 480,
      y: ((e.clientY - box.top) * 960) / box.height - 480,
    };
  };
  const cancel = () => {
    gesture = { state: "idle" };
    refresh();
  };
  const active = () =>
    options.editable() &&
    canvas.isConnected &&
    !document.documentElement.hasAttribute("data-rush-paused");
  canvas.onpointerdown = (e) => {
    if (!active() || e.button !== 0) return;
    if (gesture.state !== "idle") {
      cancel();
      return;
    }
    const p = position(e);
    if (Math.hypot(p.x, p.y) > 80) return;
    e.preventDefault();
    canvas.focus();
    gesture = { state: "drawing", id: e.pointerId, preview: null };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (gesture.state !== "drawing" || gesture.id !== e.pointerId) return;
    if (!active()) {
      cancel();
      return;
    }
    const p = position(e);
    const angle = ((Math.atan2(-p.y, p.x) * 180) / Math.PI + 360) % 360;
    const turns = Math.floor((options.value() ?? 0) / 360);
    gesture.preview =
      Math.hypot(p.x, p.y) < 48
        ? null
        : Math.min(options.max, angle + turns * 360);
    refresh();
  };
  canvas.onpointerup = (e) => {
    if (gesture.state !== "drawing" || gesture.id !== e.pointerId) return;
    const value = gesture.preview;
    gesture = { state: "idle" };
    if (active() && value !== null) options.change(value);
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    refresh();
  };
  canvas.onpointercancel = cancel;
  canvas.onlostpointercapture = cancel;
  canvas.onkeydown = (e) => {
    if (e.key === "Escape") {
      cancel();
      return;
    }
    if (!active()) return;
    const step = e.shiftKey ? 0.1 : 1;
    const changes: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: 10,
      PageDown: -10,
    };
    let value = options.value() ?? 0;
    if (e.key === "Home") value = 0;
    else if (e.key === "End") value = options.max;
    else if (e.key in changes) value += changes[e.key];
    else return;
    e.preventDefault();
    cancel();
    options.change(
      Math.round(Math.max(0, Math.min(options.max, value)) * 10) / 10,
    );
    refresh();
  };
  refresh();
  return { canvas, refresh, cancel };
}
