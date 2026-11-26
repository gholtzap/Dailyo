import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import {
  perceptionPuzzle,
  perceptionGrade,
} from "../dist/games/perception-puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173",
  day = "2026-11-26";
const policy = JSON.parse(await fs.readFile("ui-policy.json"));
const browser = await chromium.launch(),
  receipts = [],
  reports = [];
await fs.mkdir("test-results/ball-rounds", { recursive: true });
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({ viewport, colorScheme: "light" }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/daily-score", (r) => r.fulfill({ status: 404 }));
    await page.clock.install({ time: new Date(`${day}T16:00:00Z`) });
    await page.clock.pauseAt(new Date(`${day}T16:00:01Z`));
    await page.goto(`${base}/trackrot/`);
    await page.locator(".track-countdown").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Start round", exact: true })
        .count(),
      0,
    );
    assert.equal(await page.locator(".track-countdown").textContent(), "3");
    await page.clock.runFor(1000);
    assert.equal(await page.locator(".track-countdown").textContent(), "2");
    await page
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await page.clock.runFor(5000);
    assert.equal(await page.locator(".track-countdown").textContent(), "2");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.clock.runFor(1000);
    assert.equal(await page.locator(".track-countdown").textContent(), "1");
    await page.clock.runFor(2300);
    await page.getByRole("slider").waitFor();
    await page.getByRole("slider").fill("42.5");
    await page
      .getByRole("button", { name: "Check landing", exact: true })
      .click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    assert.equal(await page.locator(".track-countdown").textContent(), "3");
    await page.clock.resume();
    reports.push({
      viewport,
      state: "countdown",
      ...(await checkPage(page, policy)),
    });
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.goto(`${base}/trackrot/?practice=1`);
    await page.locator(".track-countdown").waitFor();
    await page.getByLabel("Practice variation").selectOption("hard");
    await page.clock.runFor(2999);
    assert.equal(await page.locator(".track-countdown").textContent(), "1");
    await page.clock.runFor(1301);
    await page.getByRole("slider").waitFor();
    await page.clock.resume();
    reports.push({
      viewport,
      state: "practice-answer",
      ...(await checkPage(page, policy)),
    });
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await page.goto(`${base}/rush/trackrot/`);
    const status = page.locator("#rush-status"),
      child = page.frameLocator("iframe[title=trackrot]");
    await child.locator(".track-countdown").waitFor();
    await child
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await page.clock.runFor(5000);
    assert.equal(
      await child.locator(".track-countdown").textContent(),
      "3",
      "Help also freezes the untimed opening countdown",
    );
    await child.getByRole("button", { name: "Close", exact: true }).click();
    await page.clock.runFor(4300);
    await child.getByRole("slider").waitFor();
    const seed = await rushSeed(page, "trackrot"),
      q = perceptionPuzzle("trackrot", seed, 0);
    await child
      .getByRole("slider")
      .fill(String(Number((q.target * 100).toFixed(1))));
    await child
      .getByRole("button", { name: "Check landing", exact: true })
      .click();
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.clock.runFor(200);
    await status.filter({ hasText: "Round 2" }).waitFor();
    await child.locator(".track-countdown").waitFor();
    await page.clock.runFor(1000);
    assert.equal(await child.locator(".track-countdown").textContent(), "2");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.clock.runFor(5000);
    assert.equal(await child.locator(".track-countdown").textContent(), "2");
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.clock.runFor(3300);
    await child.getByRole("slider").waitFor();
    const fieldBox = await child.locator("canvas").boundingBox();
    await child.locator("canvas").click({
      position: { x: fieldBox.width * 0.25, y: fieldBox.height * 0.85 },
    });
    assert.notEqual(
      await child.getByRole("slider").inputValue(),
      "50",
      "Tapping the field also moves the slider thumb",
    );
    await child.getByRole("slider").fill("42.5");
    await page.reload();
    await status.filter({ hasText: "Paused" }).waitFor();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    assert.equal(await child.getByRole("slider").inputValue(), "42.5");
    const remaining = await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("dailyo:rush:run:trackrot"))
          .remaining,
    );
    await page.clock.runFor(remaining - 50);
    const target = Number(
      (perceptionPuzzle("trackrot", seed, 1).target * 100).toFixed(1),
    );
    const oldSlider = await child.getByRole("slider").elementHandle();
    await child.getByRole("slider").fill(String(target));
    await page.clock.runFor(49);
    assert.equal(await child.getByRole("slider").isVisible(), true);
    await page.clock.runFor(1);
    await status.filter({ hasText: "Correct" }).waitFor();
    assert.equal(await child.getByRole("slider").count(), 0);
    assert.doesNotMatch(
      await child.locator(".perception-feedback").innerText(),
      /skipped|Time’s up/,
    );
    const feedback = await child.locator(".perception-feedback").innerText();
    await oldSlider.evaluate((n) => {
      n.value = "0";
      n.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(
      await child.locator(".perception-feedback").innerText(),
      feedback,
      "Late slider events cannot change a submitted answer",
    );
    await page.clock.runFor(200);
    await status.filter({ hasText: "Round 3" }).waitFor();
    await child.locator(".track-countdown").waitFor();
    await page.clock.runFor(4300);
    assert.equal(await child.getByRole("slider").inputValue(), "50");
    await page.clock.runFor(9700);
    const grade = perceptionGrade(
      "trackrot",
      perceptionPuzzle("trackrot", seed, 2),
      0.5,
    );
    await status
      .filter({ hasText: grade.points >= 70 ? "Correct" : "Missed" })
      .waitFor();
    await page
      .getByRole("button", { name: "Keep answer", exact: true })
      .click();
    assert.doesNotMatch(
      await child.locator(".perception-feedback").innerText(),
      /skipped|Time’s up/,
    );
    await page.screenshot({
      path: `test-results/ball-rounds/${viewport.width}-deadline.png`,
      fullPage: true,
    });
    receipts.push({
      viewport,
      countdown: true,
      helpPause: true,
      practiceReset: true,
      rushPause: true,
      reloadDraft: true,
      latestDraft: target,
      deadlineGraded: true,
      defaultSliderGraded: true,
      lateInputIgnored: true,
    });
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/ball-rounds/receipt.json",
    JSON.stringify({ base, receipts, reports }, null, 2),
  );
}
assert.deepEqual(
  reports.flatMap((r) => r.findings),
  [],
);
console.log(
  "Ball rounds: automatic countdown, help/pause/recovery, current and untouched slider deadline grading, late-event rejection, dark UI at phone and desktop sizes passed.",
);
