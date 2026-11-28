// Grading fixtures use the same keyboard transitions as an accessible picker.
// Trusted touch/pan coverage lives in price-touch.mjs.
export async function setPrice(surface, amount) {
  const cents = Math.min(10000, Math.max(0, Math.round(Number(amount) * 100)));
  for (const [name, target, maximum] of [
    ["Dollars", Math.floor(cents / 100), 100],
    ["Cents", cents % 100, 99],
  ])
    await surface.getByRole("spinbutton", { name, exact: true }).evaluate(
      (wheel, { target, maximum }) => {
        if (wheel.getAttribute("aria-disabled") === "true") return;
        const fromEnd = maximum - target < target;
        const key = (key) =>
          wheel.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
          );
        key(fromEnd ? "End" : "Home");
        let distance = fromEnd ? maximum - target : target;
        while (distance >= 10) {
          key(fromEnd ? "PageDown" : "PageUp");
          distance -= 10;
        }
        while (distance-- > 0) key(fromEnd ? "ArrowDown" : "ArrowUp");
      },
      { target, maximum },
    );
}
