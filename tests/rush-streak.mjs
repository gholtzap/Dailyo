import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { shuffle, quizPool } from "../dist/daily/puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";
import { makeSet, preparePuzzles } from "../dist/games/rot-puzzles.js";
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
    const seed = await rushSeed(page, "vocabulary");
    const deck = shuffle(quizPool(words, "vocabulary", seed), seed);
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
        `Streak ${i + 1}`,
      );
      assert.equal(
        await page
          .locator("#rush-streak")
          .evaluate((n) => n.classList.contains("rush-milestone")),
        i === 4,
      );
      if (i === 4) {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        assert.equal(
          await page
            .locator("#rush-streak")
            .evaluate((n) => getComputedStyle(n).animationName),
          "rush-streak",
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(
          await page
            .locator("#rush-streak")
            .evaluate((n) => getComputedStyle(n).animationName),
          "none",
        );
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
    assert.equal(await page.locator("#rush-streak").textContent(), "Streak 5");
    assert.equal(
      await page
        .locator("#rush-streak")
        .evaluate((n) => n.classList.contains("rush-milestone")),
      false,
      "Restoring a streak is not a new milestone",
    );
    assert.equal(
      await page
        .locator("#rush-streak")
        .evaluate((n) => getComputedStyle(n).animationName),
      "none",
    );
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
    // A real embedded round past the legacy deck boundary must wrap safely.
    const legacySeed =
      "rush:vocabulary:2026-11-21:00000000-0000-4000-8000-000000000001";
    const legacyDeck = shuffle(
      quizPool(words, "vocabulary", legacySeed),
      legacySeed,
    );
    await page.route("**/__rush-wrap-test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><iframe title="Legacy vocabulary round" src="/vocabulary/?rush=30&date=2026-11-21&run=00000000-0000-4000-8000-000000000001"></iframe>',
      }),
    );
    await page.goto(`${base}/__rush-wrap-test`);
    const legacyFrame = page.frameLocator(
      'iframe[title="Legacy vocabulary round"]',
    );
    await legacyFrame
      .getByRole("button", { name: legacyDeck[0].name, exact: true })
      .click();
    assert.ok(
      (await legacyFrame.locator(".choice.correct").innerText()).includes(
        legacyDeck[0].name,
      ),
    );
    for (const [kind, oldSize] of [
      ["maprot", 214],
      ["yearrot", 54],
    ]) {
      const raw = JSON.parse(
        await fs.readFile(`dist/games/data/${kind}.json`, "utf8"),
      );
      const seed = `rush:${kind}:2026-11-21:00000000-0000-4000-8000-000000000001`;
      const question = makeSet(kind, preparePuzzles(kind, raw), seed)[0];
      await page.route("**/__rot-wrap-test", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><iframe title="Legacy geography round" src="/${kind}/?rush=${oldSize}&date=2026-11-21&run=00000000-0000-4000-8000-000000000001"></iframe>`,
        }),
      );
      await page.goto(`${base}/__rot-wrap-test`);
      const frame = page.frameLocator('iframe[title="Legacy geography round"]');
      const title = frame.locator(
        kind === "maprot" ? "#round-title" : ".rot-year-event",
      );
      await title.waitFor({ timeout: 5000 });
      assert.ok(
        (await title.innerText()).includes(
          kind === "maprot" ? question[0] : question.event[1],
        ),
      );
      if (kind === "maprot") {
        await frame.locator(".rot-map").press("ArrowRight");
        await frame
          .getByRole("button", { name: "Check pin", exact: true })
          .click();
        await frame.locator(".rot-feedback").waitFor();
      } else {
        await frame
          .locator(".rot-slot")
          .nth(
            question.timeline.filter(([year]) => year < question.event[0])
              .length,
          )
          .click();
        assert.match(
          await frame.locator(".rot-feedback").innerText(),
          /Correct/,
        );
      }
      await page.unroute("**/__rot-wrap-test");
    }
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
  "Rush streak: immediate count, five-answer milestone, reload preservation, miss/replay reset legacy quiz/map/timeline pool boundaries, and UI policy at 390px and 1440px",
);
