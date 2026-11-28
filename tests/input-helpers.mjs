// Set the native reel inputs; gesture-inputs exercises real pointer and keys.
export async function setPrice(surface, amount) {
  const cents = Math.round(Number(amount) * 100);
  const dollars = Math.floor(cents / 100);
  for (const [name, value] of [
    ["Dollars", dollars],
    ["Cents", cents % 100],
  ])
    await surface
      .getByRole("slider", { name, exact: true })
      .evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
}
