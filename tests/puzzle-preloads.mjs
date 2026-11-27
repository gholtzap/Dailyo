import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const games = [
  "flags",
  "languages",
  "vocabulary",
  "maprot",
  "yearrot",
  "borderrot",
  "ladderrot",
  "cluerot",
  "skyrot",
  "pricerot",
  "skylinerot",
  "zoomrot",
  "orderrot",
  "trainrot",
  "trainrot-world/nyc",
  "trainrot-world/london",
];
const browser = await chromium.launch();
const receipts = [];
try {
  for (const game of games) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [],
      errors = [];
    page.on("request", (request) =>
      requests.push(new URL(request.url()).pathname),
    );
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/${game}/`);
    await page
      .locator(
        ".choice, #question-title, #round-title, #extra-title, [data-route]",
      )
      .first()
      .waitFor();
    const hints = await page
      .locator("link[data-puzzle-preload]")
      .evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
    assert.ok(hints.length, `${game}: missing puzzle data hints`);
    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map(({ name, initiatorType }) => ({
          path: new URL(name).pathname,
          initiatorType,
        })),
    );
    for (const path of hints) {
      assert.equal(
        requests.filter((url) => url === path).length,
        1,
        `${game}: ${path} must be downloaded once`,
      );
      assert.equal(
        resources.find((resource) => resource.path === path)?.initiatorType,
        "link",
        `${game}: HTML must start ${path}`,
      );
    }
    if (game === "trainrot-world/london")
      assert.ok(
        !requests.some((path) => path.endsWith("/boroughs.json")),
        "Non-NYC maps must not download unused geography",
      );
    assert.deepEqual(errors, []);
    receipts.push({ game, hints, singleDownload: true });
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/games/data/flags.json", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto(`${base}/flags/`);
  const reload = page.getByRole("button", { name: "Reload game", exact: true });
  await reload.waitFor();
  await page.unroute("**/games/data/flags.json");
  await reload.click();
  await page.locator(".choice").first().waitFor();
  await context.close();
  console.log(
    `${games.length} game pages: early data downloads reused once; failed preload recovers on reload.`,
  );
} finally {
  await browser.close();
  await fs.mkdir("test-results/performance", { recursive: true });
  await fs.writeFile(
    "test-results/performance/puzzle-preloads.json",
    JSON.stringify(receipts, null, 2),
  );
}
