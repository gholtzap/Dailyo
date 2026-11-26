import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { shuffle } from "../dist/daily/puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const words = JSON.parse(
  await fs.readFile("dist/games/data/vocabulary.json", "utf8"),
);
const browser = await chromium.launch(),
  reports = [];
await fs.mkdir("test-results/rush-improvements", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const time = new Date("2026-11-21T17:00:00Z");
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(+time + 1000));
    await page.goto(`${base}/rush/vocabulary/`);
    await page.locator("#rush-status").filter({ hasText: "Round 1" }).waitFor();
    assert.equal(await page.locator("#rush-streak").isVisible(), false);
    const deck = shuffle(words, await rushSeed(page, "vocabulary"));
    for (let i = 0; i < 5; i++) {
      await page
        .frameLocator('iframe[title="Vocabulary"]')
        .getByRole("button", { name: deck[i].name, exact: true })
        .click();
      await page
        .locator("#rush-status")
        .filter({ hasText: "Correct" })
        .waitFor();
      assert.equal(
        await page.locator("#rush-streak").textContent(),
        `🔥${i + 1}`,
      );
      if (i === 4) {
        await page.getByRole("button", { name: "Keep answer" }).click();
        await page.clock.resume();
        reports.push({
          width,
          state: "five-correct",
          ...(await checkPage(page, policy)),
        });
        await page.screenshot({
          path: `test-results/rush-improvements/streak-${width}.png`,
        });
        await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
        await page.getByRole("button", { name: "Next", exact: true }).click();
      } else await page.clock.fastForward(200);
    }
    await page.reload();
    await page.locator("#rush-status").filter({ hasText: "Paused" }).waitFor();
    assert.equal(await page.locator("#rush-streak").textContent(), "🔥5");
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page
      .frameLocator('iframe[title="Vocabulary"]')
      .getByRole("button", { name: deck[5].distractors[0], exact: true })
      .click();
    await page.locator("#rush-status").filter({ hasText: "Missed" }).waitFor();
    assert.equal(await page.locator("#rush-streak").isVisible(), false);
    await page.clock.fastForward(2400);
    await page.getByRole("heading", { name: "Rush recap" }).waitFor();
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    assert.equal(await page.locator("#rush-streak").isVisible(), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/rush-improvements/streak.json",
    JSON.stringify(reports, null, 2),
  );
}
assert.deepEqual(
  reports.flatMap((r) => r.findings),
  [],
);
console.log(
  "Rush streak: immediate count, five-answer milestone, reload preservation, miss/replay reset and UI policy at 390px and 1440px",
);
