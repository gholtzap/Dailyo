// Use the board's keyboard path, including fractional and multi-turn angles.
export async function setAngle(scope, value) {
  const board = scope.getByRole("slider", { name: "Draw angle" });
  await board.press("Home");
  const tenths = Math.round(value * 10);
  for (let i = 0; i < Math.floor(tenths / 100); i++)
    await board.press("PageUp");
  for (let i = 0; i < Math.floor((tenths % 100) / 10); i++)
    await board.press("ArrowRight");
  for (let i = 0; i < tenths % 10; i++) await board.press("Shift+ArrowRight");
}
export async function drawAngle(page, scope, value) {
  const board = scope.getByRole("slider", { name: "Draw angle" });
  const box = await board.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    x + box.width * 0.4 * Math.cos((value * Math.PI) / 180),
    y - box.height * 0.4 * Math.sin((value * Math.PI) / 180),
    { steps: 4 },
  );
  await page.mouse.up();
}
