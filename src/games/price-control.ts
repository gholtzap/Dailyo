import { element as el } from "../dom.js";
import { designValue } from "../design.js";

// Touch scroll belongs entirely to the browser: no transparent range input and
// no touch/pointer cancellation. Keep a bounded window of real snap targets so
// the full $10,000 domain doesn't require ten thousand mounted rows.
export function priceControl(
  submitPrice: (cents: number) => void,
  initial?: number,
  onChange: (cents: number) => void = () => {},
) {
  const form = el("form", undefined, "price-picker");
  const label = el("span", "Your price", "price-label");
  const reels = el("div", undefined, "price-reels");
  const amount = el("output", undefined, "screen-reader-only");
  amount.id = "price-value";
  amount.setAttribute("aria-label", "Your guess");
  const hint = el("span", "Flick dollars or cents", "price-gesture");
  const submit = el("button", "Lock in", "primary price-submit");
  submit.type = "submit";
  let value = initial ?? 0;
  let touched = initial !== undefined;
  let submitted = false;
  const frozen = () =>
    submitted ||
    document.documentElement.hasAttribute("data-rush-paused") ||
    document.hidden;
  const wheels = [makeWheel("Dollars", 10000, 100), makeWheel("Cents", 99, 1)];
  const decimal = el("span", ".", "price-decimal");
  decimal.setAttribute("aria-hidden", "true");
  reels.append(wheels[0].node, decimal, wheels[1].node);
  function render(source?: HTMLElement, preserveSource = false) {
    for (const [i, wheel] of wheels.entries()) {
      const n = i === 0 ? Math.floor(value / 100) : value % 100;
      const disabled = i === 1 && value === 1000000;
      const preserve = source
        ? source === wheel.node
          ? preserveSource
          : wheel.node.getAttribute("aria-valuenow") === String(n) &&
            wheel.node.getAttribute("aria-disabled") === String(disabled)
        : false;
      wheel.sync(n, disabled, preserve);
    }
    amount.value = touched
      ? (value / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : "Not set";
    submit.disabled = !touched || submitted;
  }
  function edit(next: number, source?: HTMLElement, preserve = false) {
    if (frozen()) return;
    value = Math.max(0, Math.min(1000000, Math.round(next)));
    touched = true;
    render(source, preserve);
    onChange(value);
  }
  function makeWheel(name: string, max: number, unit: number) {
    const node = el("div", undefined, "price-wheel");
    node.id = name === "Dollars" ? "price-dollars" : "price-cents";
    node.tabIndex = 0;
    node.setAttribute("role", "spinbutton");
    node.setAttribute("aria-label", name);
    node.setAttribute("aria-valuemin", "0");
    node.setAttribute("aria-valuemax", String(max));
    const height = Number.parseFloat(designValue("--space-12"));
    const padding = Number.parseFloat(designValue("--space-12"));
    let start = -1,
      selected = 0,
      disabled = false;
    let rows: HTMLElement[] = [];
    let visibleRows: HTMLElement[] = [];
    let mouse: { y: number; top: number } | undefined;
    let dragged = false;
    // Idle + scroll -> Scrolling; scroll continues it. End/settle -> Idle,
    // snapping and recentering only after native momentum has finished.
    // Key/tap -> Idle at the chosen row. Frozen/submitted rejects edits.
    let motion:
      | { state: "idle" }
      | { state: "scrolling"; timer: ReturnType<typeof setTimeout> } = {
      state: "idle",
    };
    const format = (n: number) =>
      unit === 100
        ? "$" + n.toLocaleString("en-US")
        : String(n).padStart(2, "0");
    function idle() {
      if (motion.state === "scrolling") clearTimeout(motion.timer);
      motion = { state: "idle" };
    }
    function windowFor(n: number) {
      const first = Math.max(0, Math.min(max - 200, n - 100));
      if (start === first) return;
      start = first;
      rows = [];
      const fragment = document.createDocumentFragment();
      for (let i = start; i <= Math.min(max, start + 200); i++) {
        const row = el("span", undefined, "price-option");
        row.append(el("span", format(i), "price-digit"));
        row.setAttribute("aria-hidden", "true");
        rows.push(row);
        fragment.append(row);
      }
      node.replaceChildren(fragment);
    }
    function sync(n: number, unavailable: boolean, preserve = false) {
      disabled = unavailable;
      for (const row of visibleRows) row.classList.remove("is-visible");
      visibleRows = [];
      const previous = rows[selected - start];
      if (previous) {
        previous.classList.remove("is-selected");
        previous.firstElementChild!.textContent = format(selected);
      }
      if (!preserve) windowFor(n);
      selected = n;
      for (let i = n - 1; i <= n + 1; i++) {
        const neighbor = rows[i - start];
        if (neighbor) {
          neighbor.classList.add("is-visible");
          visibleRows.push(neighbor);
        }
      }
      const row = rows[n - start];
      if (row) {
        row.classList.add("is-selected");
        row.firstElementChild!.textContent = touched
          ? format(n)
          : unit === 100
            ? "$—"
            : "—";
      }
      node.setAttribute("aria-valuenow", String(n));
      node.setAttribute(
        "aria-valuetext",
        touched ? `${n} ${name.toLowerCase()}` : "Not set",
      );
      node.setAttribute("aria-disabled", String(disabled || submitted));
      if (!preserve) {
        idle();
        node.scrollTop = (n - start) * height;
      }
    }
    function nearest() {
      return Math.max(
        start,
        Math.min(
          start + rows.length - 1,
          start + Math.round(node.scrollTop / height),
        ),
      );
    }
    function choose(n: number, preserve = false) {
      if (disabled || frozen()) {
        sync(selected, disabled);
        return;
      }
      const next =
        unit === 100
          ? n * 100 + (value % 100)
          : Math.floor(value / 100) * 100 + n;
      edit(next, node, preserve);
    }
    function settle() {
      idle();
      if (mouse || !form.isConnected) return;
      if (frozen()) {
        sync(unit === 100 ? Math.floor(value / 100) : value % 100, disabled);
        return;
      }
      const n = nearest();
      if (n !== selected) choose(n, true);
      windowFor(selected);
      sync(selected, disabled);
    }
    node.onscroll = () => {
      if (!form.isConnected) return;
      if (disabled || frozen()) {
        sync(unit === 100 ? Math.floor(value / 100) : value % 100, disabled);
        return;
      }
      const n = nearest();
      if (n !== selected) choose(n, true);
      idle();
      motion = { state: "scrolling", timer: setTimeout(settle, 150) };
    };
    node.addEventListener("scrollend", settle);
    node.onblur = () => node.removeAttribute("data-pointer-focus");
    node.onkeydown = (event) => {
      node.removeAttribute("data-pointer-focus");
      const step = {
        ArrowUp: 1,
        ArrowRight: 1,
        ArrowDown: -1,
        ArrowLeft: -1,
        PageUp: 10,
        PageDown: -10,
      }[event.key];
      if (step !== undefined || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        idle();
        const n =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? max
              : Math.max(0, Math.min(max, selected + (step ?? 0)));
        choose(n);
      }
    };
    node.onclick = (event) => {
      if (dragged) {
        dragged = false;
        return;
      }
      const rect = node.getBoundingClientRect();
      const n =
        start +
        Math.floor(
          (node.scrollTop + event.clientY - rect.top - padding) / height,
        );
      idle();
      choose(Math.max(0, Math.min(max, n)));
    };
    // Desktop mouse drag is separate; touch uses native pan, inertia and snap.
    node.onpointerdown = (event) => {
      node.setAttribute("data-pointer-focus", "");
      dragged = false;
      if (
        event.pointerType !== "mouse" ||
        event.button !== 0 ||
        disabled ||
        frozen()
      )
        return;
      event.preventDefault();
      node.focus({ preventScroll: true });
      mouse = { y: event.clientY, top: node.scrollTop };
      node.setPointerCapture(event.pointerId);
    };
    node.onpointermove = (event) => {
      if (!mouse || event.pointerType !== "mouse") return;
      if (Math.abs(event.clientY - mouse.y) > 4) dragged = true;
      node.scrollTop = mouse.top + mouse.y - event.clientY;
    };
    const endMouse = () => {
      if (!mouse) return;
      mouse = undefined;
      settle();
    };
    node.onpointerup = endMouse;
    node.onpointercancel = endMouse;
    return { node, sync, stop: idle };
  }
  form.append(label, reels, hint, amount, submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!touched || frozen()) return;
    // Read the visible row synchronously, including a tap during scrolling.
    for (const wheel of wheels)
      wheel.node.dispatchEvent(new Event("scrollend"));
    submitted = true;
    for (const wheel of wheels) wheel.stop();
    render();
    submitPrice(value);
  };
  render();
  // Before the caller mounts the form there is no scroll box to position.
  queueMicrotask(() => {
    if (form.isConnected) render();
  });
  return form;
}
