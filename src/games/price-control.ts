import { element as el } from "../dom.js";

// The range is fixed across products: it must never disclose the answer.
export function priceControl(submitPrice: (cents: number) => void) {
  const form = el("form", undefined, "price-picker");
  const amount = el("output", "$0.00", "price-value");
  amount.id = "price-value";
  amount.setAttribute("aria-label", "Your guess");
  amount.htmlFor = "price-dollars price-cents";
  const bounds = el("label", "Dollar range", "price-range-label");
  const scale = el("select");
  scale.setAttribute("aria-label", "Dollar range");
  for (const maximum of [20, 100, 1000, 10000]) {
    const option = el("option", `$0–$${maximum.toLocaleString("en-US")}`);
    option.value = String(maximum);
    scale.append(option);
  }
  bounds.append(scale);
  const dollars = range("Dollars", "price-dollars", 20);
  const cents = range("Cents", "price-cents", 99);
  const submit = el("button", "Check price", "primary");
  submit.type = "submit";
  submit.disabled = true;
  const total = () =>
    Math.min(
      1000000,
      dollars.input.valueAsNumber * 100 + cents.input.valueAsNumber,
    );
  const update = () => {
    less.disabled = dollars.input.valueAsNumber === 0;
    more.disabled = dollars.input.valueAsNumber === Number(dollars.input.max);
    cents.input.disabled = dollars.input.valueAsNumber === 10000;
    if (cents.input.disabled) cents.input.value = "0";
    amount.value = (total() / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    dollars.value.textContent = dollars.input.value;
    cents.value.textContent = cents.input.value.padStart(2, "0");
    submit.disabled = false;
  };
  const steps = el("span", undefined, "price-stepper");
  const less = el("button", "Less $1", "secondary");
  const more = el("button", "More $1", "secondary");
  less.type = more.type = "button";
  less.disabled = true;
  less.onclick = () => {
    dollars.input.stepDown();
    update();
  };
  more.onclick = () => {
    dollars.input.stepUp();
    update();
  };
  dollars.label.append(steps);
  steps.append(less, dollars.input, more);
  dollars.input.oninput = update;
  cents.input.oninput = update;
  scale.onchange = () => {
    dollars.input.max = scale.value;
    update();
  };
  form.append(amount, bounds, dollars.label, cents.label, submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!submit.disabled) submitPrice(total());
  };
  return form;
}

function range(name: string, id: string, max: number) {
  const label = el("div", undefined, "price-range");
  const heading = el("span", undefined, "price-range-heading");
  const value = el("span", name === "Cents" ? "00" : "0");
  value.setAttribute("aria-hidden", "true");
  const text = el("label", name);
  text.htmlFor = id;
  heading.append(text, value);
  const input = el("input", undefined, "range-control");
  input.id = id;
  input.setAttribute("aria-label", name);
  input.type = "range";
  input.min = "0";
  input.max = String(max);
  input.step = "1";
  input.value = "0";
  label.append(heading, input);
  return { label, input, value };
}
