import assert from "node:assert/strict";

export async function rushSeed(page, kind) {
  const src = await page.locator("iframe[title]").getAttribute("src");
  const params = new URL(src, "http://localhost").searchParams;
  assert.ok(params.get("run"), "Rush frames must belong to a run");
  return `rush:${kind}:${params.get("date")}:${params.get("run")}`;
}

// Exercise fixed-sequence integration cases as a previously saved run. Fresh
// shuffled runs are covered separately in rush-randomization.mjs.
export async function seedMixedRun(page, date) {
  const { rushGames } = await import("../dist/daily/rush-games.js");
  const saved = {
    date,
    games: rushGames.map((g) => g.label).join(","),
    runId: "00000000-0000-4000-8000-000000000001",
    index: 0,
    round: 0,
    remaining: 0,
    scores: rushGames.map(() => 0),
    streak: 0,
  };
  await page.evaluate(
    (saved) =>
      sessionStorage.setItem("dailyo:rush:run:all", JSON.stringify(saved)),
    saved,
  );
}
export async function initialMixedRun(page, date) {
  const { rushGames } = await import("../dist/daily/rush-games.js");
  await page.addInitScript(
    ({ date, labels }) => {
      if (
        window.parent !== window ||
        location.origin === "null" ||
        sessionStorage.getItem("dailyo:rush:run:all")
      )
        return;
      sessionStorage.setItem(
        "dailyo:rush:run:all",
        JSON.stringify({
          date,
          games: labels.join(","),
          runId: "00000000-0000-4000-8000-000000000001",
          index: 0,
          round: 0,
          remaining: 0,
          scores: labels.map(() => 0),
          streak: 0,
        }),
      );
    },
    { date, labels: rushGames.map((g) => g.label) },
  );
}
