import { assertEditorialUI } from "./editorial-helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { shuffle } from "../dist/daily/puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const output = "test-results/playroom";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const flags = JSON.parse(
  await fs.readFile("dist/games/data/flags.json", "utf8"),
);
const browser = await chromium.launch(),
  reports = [];
await fs.mkdir(output, { recursive: true });
async function inspect(page, name) {
  await assertEditorialUI(page);
  await page.clock.resume();
  reports.push({ name, ...(await checkPage(page, policy)) });
  const frames = page.locator("iframe[title]:not([hidden])");
  const frame = (await frames.count()) ? await frames.elementHandle() : null;
  if (frame)
    reports.push({
      name: `${name}-game`,
      ...(await checkPage(await frame.contentFrame(), policy)),
    });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    name,
  );
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  console.log(name);
}
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/daily-score", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.clock.install({ time: new Date("2026-11-25T17:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-25T17:00:01Z"));
    await page.goto(`${base}/rush/flagrot/`);
    const status = page.locator("#rush-status");
    await status.filter({ hasText: "Round 1" }).waitFor({ state: "attached" });
    assert.equal(await page.locator("#rush-game-name").textContent(), "Flags");
    assert.equal(await page.locator("#rush-clock").isVisible(), false);
    assert.equal(await page.locator("#rush-streak").isVisible(), false);
    assert.equal(
      await status.evaluate((n) => getComputedStyle(n).clipPath),
      "inset(50%)",
    );
    const deck = shuffle(flags, await rushSeed(page, "flags"));
    const child = () => page.frameLocator('iframe[title="flagrot"]');
    await child().locator(".choice").first().waitFor();
    await inspect(page, `${width}-opening`);
    await child()
      .getByRole("button", { name: deck[0].name, exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await status.filter({ hasText: "Correct" }).waitFor({ state: "attached" });
    assert.equal(await child().locator(".choice.correct").count(), 1);
    assert.equal(
      await page.locator("#rush-streak").getAttribute("aria-label"),
      "Streak: 1",
    );
    await page
      .getByRole("button", { name: "Keep answer", exact: true })
      .click();
    await inspect(page, `${width}-correct`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await status.filter({ hasText: "Round 2" }).waitFor({ state: "attached" });
    await inspect(page, `${width}-timed`);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    assert.equal(
      await child().locator("html").getAttribute("data-rush-paused"),
      "",
    );
    await inspect(page, `${width}-paused`);
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.reload();
    await status.filter({ hasText: "Paused" }).waitFor({ state: "attached" });
    assert.equal(
      await page.locator("#rush-streak").getAttribute("aria-label"),
      "Streak: 1",
    );
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await child()
      .locator(".choice")
      .filter({ hasNotText: deck[1].name })
      .first()
      .click();
    await status.filter({ hasText: "Missed" }).waitFor({ state: "attached" });
    await page
      .getByRole("button", { name: "Keep answer", exact: true })
      .click();
    assert.equal(await child().locator(".choice.correct").count(), 1);
    assert.equal(await child().locator(".choice.wrong").count(), 1);
    assert.equal(await page.locator("#rush-streak").isVisible(), false);
    await inspect(page, `${width}-miss`);
    await page.getByRole("button", { name: "See recap", exact: true }).click();
    await page
      .getByRole("heading", { name: "Rush recap", exact: true })
      .waitFor();
    assert.equal(await page.locator("#rush-score").textContent(), "1 correct");
    assert.equal(await page.locator("#rush-best-streak").textContent(), "1");
    assert.equal(await page.locator("#feed-results").isVisible(), false);
    await inspect(page, `${width}-recap`);
    await page.locator(".rush-breakdown > summary").click();
    await inspect(page, `${width}-review`);
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    await status.filter({ hasText: "Round 1" }).waitFor({ state: "attached" });
    assert.equal(await page.locator("#rush-streak").isVisible(), false);
    await page.getByText("Games", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Games", exact: true })
      .getByRole("link", { name: "Words", exact: true })
      .waitFor();
    await inspect(page, `${width}-menu`);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".site-more").getAttribute("open"), null);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(`${output}/ui.json`, JSON.stringify(reports, null, 2));
}
const findings = reports.flatMap((report) => report.findings);
assert.deepEqual(findings, []);
console.log(
  `Playroom: keyboard play, feedback, timer, pause, recovery, recap, review, replay and menu; ${reports.length} UI checks passed.`,
);
