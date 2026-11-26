import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { extraPuzzle, prepareExtra } from "../dist/games/extra-puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch(),
  receipts = [],
  reports = [];
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
await fs.mkdir("test-results/rush-improvements", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      colorScheme: "dark",
      hasTouch: width === 390,
    });
    await page.addInitScript(() => {
      Object.defineProperty(crypto, "randomUUID", {
        value: () => "00000000-0000-4000-8000-000000000054",
      });
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const inspect = async (state) => {
      await page.clock.resume();
      reports.push({ width, state, ...(await checkPage(page, policy)) });
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    };
    const time = new Date("2026-11-21T17:00:00Z");
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(+time + 1000));
    const raw = JSON.parse(
        await fs.readFile("dist/games/data/scalerot.json", "utf8"),
      ),
      data = prepareExtra("scalerot", raw);
    await page.goto(`${base}/rush/scalerot/`);
    const status = page.locator("#rush-status");
    await status.filter({ hasText: "Round 1" }).waitFor();
    const seed = await rushSeed(page, "scalerot"),
      q = extraPuzzle("scalerot", data, `${seed}:0`);
    const child = () => page.frameLocator('iframe[title="scalerot"]');
    await child().getByRole("spinbutton").fill(String(q.actual));
    await child().getByRole("button", { name: "Check estimate" }).click();
    await page
      .getByRole("button", { name: "Keep answer", exact: true })
      .click();
    await page.clock.fastForward(10000);
    assert.equal(await status.textContent(), "Correct");
    await inspect("held");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await status.filter({ hasText: "Round 2" }).waitFor();
    assert.equal(await page.locator("#rush-round").textContent(), "Round 2");
    await child().getByRole("spinbutton").fill("123");
    await page.clock.fastForward(2000);
    const remaining = await page.getByRole("timer").innerText();
    await page
      .getByRole("button", { name: "Review answer", exact: true })
      .click();
    await page
      .frameLocator('iframe[title="Previous answer"]')
      .getByText(q.explanation, { exact: true })
      .waitFor();
    assert.equal(await page.locator("#rush-round").textContent(), "Round 1");
    await page.clock.fastForward(20000);
    assert.equal(await page.locator("#rush-clock").innerText(), remaining);
    assert.equal(await page.locator(".rush-time").isVisible(), false);
    // A completed frame cannot answer on behalf of the paused current round.
    await page
      .frameLocator('iframe[title="Previous answer"]')
      .locator("body")
      .evaluate(() =>
        parent.postMessage(
          { type: "rush-game", phase: "answered", correct: true },
          location.origin,
        ),
      );
    await inspect("review");
    await page.screenshot({
      path: `test-results/rush-improvements/review-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Back to puzzle", exact: true })
      .press("Enter");
    assert.equal(await child().getByRole("spinbutton").inputValue(), "123");
    assert.equal(await page.getByRole("timer").innerText(), remaining);
    await status.filter({ hasText: "Round 2" }).waitFor();
    assert.equal(await page.locator("#rush-round").textContent(), "Round 2");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page
      .getByRole("button", { name: "Review answer", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Back to puzzle", exact: true })
      .click();
    await status.filter({ hasText: "Paused" }).waitFor();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await child().getByRole("spinbutton").fill("0");
    await child().getByRole("button", { name: "Check estimate" }).click();
    await status.filter({ hasText: "Missed" }).waitFor();
    const result = await child().getByRole("heading").first().boundingBox();
    const touch =
      width === 390 ? await page.context().newCDPSession(page) : null;
    if (touch)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: result.x + 10, y: result.y + 10 }],
      });
    else {
      await page.mouse.move(result.x + 10, result.y + 10);
      await page.mouse.down();
    }
    await page.clock.fastForward(10000);
    assert.equal(
      await status.textContent(),
      "Missed",
      "Press holds the real answer",
    );
    if (touch)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    else await page.mouse.up();
    await page.clock.fastForward(2500);
    await page
      .getByRole("heading", { name: "Rush recap", exact: true })
      .waitFor();
    await page.locator(".rush-breakdown > summary").click();
    await page
      .getByRole("button", { name: "Review last answer", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Back to recap", exact: true })
      .click();
    assert.match(
      await page.locator("#rush-score").textContent(),
      /^1 correct/,
      "Review and stale answers never score twice",
    );
    assert.deepEqual(errors, []);
    receipts.push({
      width,
      remaining,
      draft: "123",
      correct: 1,
      checks: [
        "explicit hold",
        "pointer hold and release",
        "keyboard return",
        "paused return",
        "draft and deadline preservation",
        "stale answer rejection",
        "recap review",
      ],
    });
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/rush-improvements/review.json",
    JSON.stringify({ receipts, reports }, null, 2),
  );
}
const findings = reports.flatMap((r) =>
  r.findings.map((f) => ({ width: r.width, state: r.state, ...f })),
);
assert.deepEqual(findings, []);
console.log(
  "Rush answer review: hold, release, return, drafts, clocks, stale messages and recap at 390px and 1440px; UI policy passed",
);
