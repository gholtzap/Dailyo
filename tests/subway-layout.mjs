import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
await fs.mkdir("test-results/subway-layout", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 568 },
      reducedMotion: "reduce",
    });
    await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
    await page.goto(`${base}/rush/trainrot/`);
    const frame = page.frameLocator('iframe[title="trainrot"]');
    await frame.locator("[data-route]").first().waitFor();
    await page.waitForFunction(() => {
      const f = document.querySelector('iframe[title="trainrot"]');
      return (
        f?.contentDocument?.documentElement.scrollHeight <= f.clientHeight + 2
      );
    });
    assert.ok(
      await page.evaluate(() => {
        const f = document.querySelector('iframe[title="trainrot"]');
        return (
          f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 2
        );
      }),
      "Complete map and planner belong to the outer page",
    );
    const board = await page.locator(".feed-body").boundingBox();
    const header = await page.locator(".feed-actions").boundingBox();
    assert.ok(board.width <= header.width, "Map stays within the host board");
    await frame.locator("[data-route]").first().click();
    await frame.locator("#reveal").scrollIntoViewIfNeeded();
    assert.equal(await frame.locator("body").evaluate(() => scrollY), 0);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/subway-layout/${engine.name()}-${width}.png`,
      fullPage: true,
    });
    await frame.locator("#reveal").click();
    await page
      .locator("#rush-status")
      .filter({ hasText: /Correct|Missed/ })
      .waitFor();
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(
  "Subway map, route editing and submission remain reachable on mobile and desktop.",
);
