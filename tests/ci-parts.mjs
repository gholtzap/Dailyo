import assert from "node:assert/strict";
export function ciWidths(widths) {
  if (process.argv.includes("--ci-shared")) return [];
  const part = process.argv.find((arg) => arg.startsWith("--ci-width="));
  if (!part) return widths;
  const width = Number(part.slice("--ci-width=".length));
  assert.ok(widths.includes(width), `Unknown CI viewport: ${width}`);
  return [width];
}
export function ciGames(games) {
  const part = process.argv.find((arg) => arg.startsWith("--ci-game="));
  if (!part) return games;
  const game = part.slice("--ci-game=".length);
  assert.ok(games.includes(game), `Unknown CI game: ${game}`);
  return [game];
}

export function ciShared() {
  return (
    process.argv.includes("--ci-shared") ||
    !process.argv.some((arg) => arg.startsWith("--ci-width="))
  );
}

export function ciMotions(motions) {
  const part = process.argv.find((arg) => arg.startsWith("--ci-motion="));
  if (!part) return motions;
  const motion = part.slice("--ci-motion=".length);
  assert.ok(
    motions.includes(motion),
    `Unknown CI motion preference: ${motion}`,
  );
  return [motion];
}
