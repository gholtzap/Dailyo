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
    !process.argv.some(
      (arg) =>
        arg.startsWith("--ci-width=") || arg.startsWith("--ci-viewport="),
    )
  );
}

export const motionPreferences = ["no-preference", "reduce"];
export function ciMotions() {
  const part = process.argv.find((arg) => arg.startsWith("--ci-motion="));
  if (!part) return motionPreferences;
  const value = part.slice("--ci-motion=".length);
  assert.ok(
    motionPreferences.includes(value),
    `Unknown CI motion preference: ${value}`,
  );
  return [value];
}
export function playtestViewports(viewports) {
  return [...viewports, { width: 390, height: 600 }];
}
export function ciViewports(viewports) {
  if (process.argv.includes("--ci-shared")) return [];
  const part = process.argv.find((arg) => arg.startsWith("--ci-viewport="));
  if (!part) return viewports;
  const selected = viewports.filter(
    (v) => `${v.width}x${v.height}` === part.slice("--ci-viewport=".length),
  );
  assert.ok(selected.length, `Unknown CI viewport: ${part}`);
  return selected;
}
