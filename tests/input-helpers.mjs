// Set the two native ranges through their input events; gesture-inputs also
// exercises pointer and keyboard operation of the rendered controls.
export async function setPrice(surface, amount) {
  const cents = Math.round(Number(amount) * 100);
  const dollars = Math.floor(cents / 100);
  const maximum = [20, 100, 1000, 10000].find((max) => max >= dollars);
  await surface
    .getByLabel("Dollar range", { exact: true })
    .selectOption(String(maximum));
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
