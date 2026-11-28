import { element as el } from "../dom.js";
import { designValue } from "../design.js";

export const MAX_PRICE_CENTS = 10000;

// Touch scrolling belongs to the browser. The $0–$100 range fits in one fixed
// list of real snap targets; rows never need to be recycled during a gesture.
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
  let value = Math.max(0, Math.min(MAX_PRICE_CENTS, Math.round(initial ?? 0)));
  let touched = initial !== undefined;
  let submitted = false;
  const frozen = () =>
    submitted ||
    document.documentElement.hasAttribute("data-rush-paused") ||
    document.hidden;
  const wheels = [
    makeWheel("Dollars", MAX_PRICE_CENTS / 100, 100),
    makeWheel("Cents", 99, 1),
  ];
  const decimal = el("span", ".", "price-decimal");
  decimal.setAttribute("aria-hidden", "true");
  reels.append(wheels[0].node, decimal, wheels[1].node);
  function render(source?: HTMLElement, preserveSource = false) {
    for (const [i, wheel] of wheels.entries()) {
      const n = i === 0 ? Math.floor(value / 100) : value % 100;
      const disabled = i === 1 && value === MAX_PRICE_CENTS;
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
    value = Math.max(0, Math.min(MAX_PRICE_CENTS, Math.round(next)));
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
    const nativeScrollEnd = "onscrollend" in node;
    node.setAttribute("aria-busy", "false");
    const height = Number.parseFloat(designValue("--space-12"));
    const padding = Number.parseFloat(designValue("--space-12"));
    const glyphHeight = Number.parseFloat(designValue("--font-size-24"));
    let selected = 0,
      disabled = false;
    const rows: HTMLElement[] = [];
    let visibleRows: HTMLElement[] = [];
    let mouse: { y: number; top: number } | undefined;
    let dragged = false;
    let contacts = 0;
    // State       Event                 Next / effect
    // Idle        native scroll         Scrolling / track visible value
    // Scrolling   scroll                Scrolling / continue browser momentum
    // Scrolling   end, no held contact  Idle / finish any remaining snap
    // Either      tap or mouse release  Scrolling / glide to the chosen row
    // Either      key                   Idle if centered, else Scrolling / position directly
    // Either      frozen/submitted      Reject edits / restore the committed position
    let motion:
      | { state: "idle" }
      | { state: "scrolling"; timer?: ReturnType<typeof setTimeout> } = {
      state: "idle",
    };
    const format = (n: number) =>
      unit === 100
        ? "$" + n.toLocaleString("en-US")
        : String(n).padStart(2, "0");
    function idle() {
      if (motion.state === "scrolling") clearTimeout(motion.timer);
      motion = { state: "idle" };
      node.setAttribute("aria-busy", "false");
    }
    function scrolling() {
      if (motion.state === "scrolling") clearTimeout(motion.timer);
      motion = {
        state: "scrolling",
        timer: nativeScrollEnd ? undefined : setTimeout(settle, 150),
      };
      node.setAttribute("aria-busy", "true");
    }
    const fragment = document.createDocumentFragment();
    for (let i = 0; i <= max; i++) {
      const row = el("span", undefined, "price-option");
      row.append(el("span", format(i), "price-digit"));
      row.setAttribute("aria-hidden", "true");
      rows.push(row);
      fragment.append(row);
    }
    node.append(fragment);
    function sync(n: number, unavailable: boolean, preserve = false) {
      disabled = unavailable;
      const previous = rows[selected];
      if (previous) {
        previous.classList.remove("is-selected");
        previous.firstElementChild!.textContent = format(selected);
      }
      selected = n;
      paintVisibleRows();
      const row = rows[n];
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
        const top = n * height;
        if (Math.abs(node.scrollTop - top) > 0.01) {
          scrolling();
          node.scrollTo({ top, behavior: "instant" });
        }
      }
    }
    // Keep every glyph that can intersect the viewport painted, including both
    // partially entering rows. Hiding only fully clipped rows also keeps UI
    // inspection focused on the real scroll viewport.
    function paintVisibleRows() {
      const position = node.scrollTop / height;
      const center = Math.round(position);
      const radius = (node.clientHeight + glyphHeight) / 2;
      const next: HTMLElement[] = [];
      for (let i = center - 2; i <= center + 2; i++) {
        if (rows[i] && Math.abs(i * height - node.scrollTop) < radius)
          next.push(rows[i]);
      }
      for (const row of visibleRows)
        if (!next.includes(row)) row.classList.remove("is-visible");
      for (const row of next) row.classList.add("is-visible");
      visibleRows = next;
    }
    function glide(n: number) {
      if (disabled || frozen()) return;
      choose(n, true);
      scrolling();
      node.scrollTo({
        top: n * height,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      if (Math.abs(node.scrollTop - n * height) < 1) idle();
    }
    function nearest() {
      return Math.max(0, Math.min(max, Math.round(node.scrollTop / height)));
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
      if (mouse || contacts || !form.isConnected) return;
      idle();
      if (frozen()) {
        sync(unit === 100 ? Math.floor(value / 100) : value % 100, disabled);
        return;
      }
      const n = nearest();
      if (n !== selected) choose(n, true);
      // Native snap owns touch deceleration. Only finish an unsnapped mouse
      // drag or a legacy-browser fallback, without an instantaneous correction.
      if (Math.abs(node.scrollTop - n * height) > 1) glide(n);
    }
    node.onscroll = () => {
      if (!form.isConnected) return;
      if (disabled || frozen()) {
        sync(unit === 100 ? Math.floor(value / 100) : value % 100, disabled);
        return;
      }
      paintVisibleRows();
      const n = nearest();
      if (n !== selected) choose(n, true);
      scrolling();
    };
    node.addEventListener("scrollend", settle);
    node.addEventListener(
      "touchstart",
      (event) => {
        contacts = event.touches.length;
      },
      { passive: true },
    );
    const endTouch = (event: TouchEvent) => {
      contacts = event.touches.length;
      if (!contacts && !nativeScrollEnd && motion.state === "scrolling")
        scrolling();
    };
    node.addEventListener("touchend", endTouch, { passive: true });
    node.addEventListener("touchcancel", endTouch, { passive: true });
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
      const n = Math.floor(
        (node.scrollTop + event.clientY - rect.top - padding) / height,
      );
      idle();
      glide(Math.max(0, Math.min(max, n)));
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
      node.setAttribute("data-dragging", "");
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
      node.removeAttribute("data-dragging");
      glide(nearest());
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
