import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { boardGames } from "../dist/games/board-catalog.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4186";
const browser = await chromium.launch();
const receipts = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      colorScheme: "light",
    });
    let releaseFrame = () => {};
    let readyFrame = Promise.resolve();
    await page.route("**/*", async (route) => {
      if (
        route.request().isNavigationRequest() &&
        route.request().frame().parentFrame()
      )
        await readyFrame;
      await route.continue();
    });
    for (const game of boardGames) {
      readyFrame = new Promise((resolve) => {
        releaseFrame = resolve;
      });
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page
        .locator("iframe.feed-loading")
        .first()
        .waitFor({ state: "attached" });
      await page.locator(".site-more summary").click();
      releaseFrame();
      await page.locator("iframe[title]:not(.feed-loading)").waitFor();
      assert.ok(
        await page.locator(".site-more").evaluate((menu) => menu.open),
        "A game finishing loading must preserve the open Games menu",
      );
      const link = page
        .getByRole("navigation", { name: "Games", exact: true })
        .getByRole("link", { name: game.name, exact: true });
      assert.equal(await link.getAttribute("href"), `/${game.id}/`);
      await link.click();
      await page.locator(".puzzle-grid").waitFor();
      assert.equal(
        await page.locator("body").getAttribute("data-game"),
        game.id,
      );
      receipts.push({ width, game: game.id, url: page.url() });
    }
    await page.close();
  }
} finally {
  await browser.close();
  await fs.mkdir("test-results/board-games", { recursive: true });
  await fs.writeFile(
    "test-results/board-games/directory.json",
    JSON.stringify({ base, receipts }, null, 2),
  );
}
console.log(
  "Every new board game is reachable from the homepage Games menu on mobile and desktop.",
);
