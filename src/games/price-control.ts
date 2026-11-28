import { element as el } from "../dom.js";

// One open estimate, independent of the product's actual price. Editing never
// submits; an untouched picker remains distinct from an intentional zero.
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
  amount.htmlFor = "price-dollars price-cents";
  const hint = el("span", "Flick dollars or cents", "price-gesture");
  const submit = el("button", "Lock in", "primary price-submit");
  submit.type = "submit";
  let value = initial ?? 0;
  let touched = initial !== undefined;
  const wheels = [
    makeWheel("Dollars", "price-dollars", 10000),
    makeWheel("Cents", "price-cents", 99),
  ];
  const decimal = el("span", ".", "price-decimal");
  decimal.setAttribute("aria-hidden", "true");
  reels.append(wheels[0].wheel, decimal, wheels[1].wheel);
  function render() {
    const dollars = Math.floor(value / 100),
      cents = value % 100;
    for (const [i, wheel] of wheels.entries()) {
      const n = i === 0 ? dollars : cents;
      const format = (n: number) =>
        i === 0 ? "$" + n.toLocaleString("en-US") : String(n).padStart(2, "0");
      wheel.input.value = String(n);
      wheel.input.disabled = i === 1 && dollars === 10000;
      wheel.input.setAttribute(
        "aria-valuetext",
        touched ? (i === 0 ? `${n} dollars` : `${n} cents`) : "Not set",
      );
      wheel.previous.textContent = touched && n > 0 ? format(n - 1) : "";
      wheel.number.textContent = touched ? format(n) : i === 0 ? "$—" : "—";
      wheel.next.textContent =
        n < Number(wheel.input.max) && !wheel.input.disabled
          ? format(n + 1)
          : "";
    }
    amount.value = touched
      ? (value / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : "Not set";
    submit.disabled = !touched;
  }
  function edit(next: number) {
    value = Math.max(0, Math.min(1000000, Math.round(next)));
    touched = true;
    render();
    onChange(value);
  }
  for (const [i, wheel] of wheels.entries()) {
    const unit = i === 0 ? 100 : 1;
    wheel.input.oninput = () =>
      edit(
        i === 0
          ? wheel.input.valueAsNumber * 100 + (value % 100)
          : Math.floor(value / 100) * 100 + wheel.input.valueAsNumber,
      );
    let drag: { y: number; value: number; id: number } | undefined;
    wheel.input.onpointerdown = (event) => {
      if (event.button !== 0 || wheel.input.disabled) return;
      event.preventDefault();
      wheel.input.focus({ preventScroll: true });
      drag = { y: event.clientY, value, id: event.pointerId };
      wheel.input.setPointerCapture(event.pointerId);
    };
    wheel.input.onpointermove = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const steps = Math.round((drag.y - event.clientY) / 18);
      if (steps) edit(drag.value + steps * unit);
    };
    wheel.input.onpointerup = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      // A tap on a neighboring row is also a single precise step.
      if (Math.abs(event.clientY - drag.y) < 6) {
        const box = wheel.input.getBoundingClientRect();
        const y = event.clientY - box.top;
        edit(
          value +
            (y < box.height / 3 ? -unit : y > (box.height * 2) / 3 ? unit : 0),
        );
      }
      drag = undefined;
      if (wheel.input.hasPointerCapture(event.pointerId))
        wheel.input.releasePointerCapture(event.pointerId);
    };
    wheel.input.onpointercancel = () => {
      drag = undefined;
    };
    wheel.input.onkeydown = (event) => {
      const delta = {
        ArrowUp: unit,
        ArrowRight: unit,
        ArrowDown: -unit,
        ArrowLeft: -unit,
        PageUp: unit * 10,
        PageDown: -unit * 10,
      }[event.key];
      if (delta !== undefined) {
        event.preventDefault();
        edit(value + delta);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        edit(
          i === 0
            ? event.key === "Home"
              ? value % 100
              : 1000000
            : Math.floor(value / 100) * 100 + (event.key === "Home" ? 0 : 99),
        );
      }
    };
    wheel.input.addEventListener(
      "wheel",
      (event) => {
        if (wheel.input.disabled) return;
        event.preventDefault();
        edit(value + (event.deltaY > 0 ? unit : -unit));
      },
      { passive: false },
    );
  }
  form.append(label, reels, hint, amount, submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!touched || submit.disabled) return;
    submit.disabled = true;
    submitPrice(value);
  };
  render();
  return form;
}

function makeWheel(name: string, id: string, max: number) {
  const wheel = el("div", undefined, "price-wheel");
  const previous = el("span", undefined, "price-neighbor");
  const number = el("span", undefined, "price-number");
  const next = el("span", undefined, "price-neighbor");
  for (const n of [previous, number, next])
    n.setAttribute("aria-hidden", "true");
  const input = el("input", undefined, "price-reel-input");
  input.id = id;
  input.setAttribute("aria-label", name);
  input.type = "range";
  input.min = "0";
  input.max = String(max);
  input.step = "1";
  input.value = "0";
  wheel.append(previous, number, next, input);
  return { wheel, input, previous, number, next };
}
