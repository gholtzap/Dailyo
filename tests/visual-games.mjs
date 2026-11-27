import { assertEditorialUI } from "./editorial-helpers.mjs";
import { gameName } from "../dist/game-names.js";
import { ciWidths, ciShared } from "./ci-parts.mjs";
import { rushSeed } from "./rush-helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  visualGames,
  visualSet,
  prepareVisual,
} from "../dist/games/visual-puzzles.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const day = "2026-11-28";
const browser = await chromium.launch();
const data = Object.fromEntries(
  await Promise.all(
    visualGames.map(async (game) => [
      game,
      prepareVisual(
        game,
        JSON.parse(
          await fs.readFile(
            new URL(`../dist/games/data/${game}.json`, import.meta.url),
            "utf8",
          ),
        ),
      ),
    ]),
  ),
);
assert.deepEqual(
  visualSet("orderrot", data.orderrot, "2026-11-27"),
  JSON.parse(
    await fs.readFile(
      new URL("./fixtures/issued-order-puzzle.json", import.meta.url),
      "utf8",
    ),
  ),
);
async function solve(surface, game, q) {
  if (game === "pricerot") {
    await surface.getByLabel("Your guess").fill(String(q.item.cents / 100));
    await surface
      .getByRole("button", { name: "Check price", exact: true })
      .click();
  } else if (game === "orderrot") {
    const sorted = [...q.tiles].sort((a, b) => a.value - b.value);
    for (const [position, tile] of sorted.entries()) {
      while (
        (await surface
          .locator(".visual-order li")
          .nth(position)
          .locator("span")
          .textContent()) !== tile.name
      ) {
        await surface
          .getByRole("button", { name: `Move ${tile.name} up`, exact: true })
          .click();
      }
    }
    await surface
      .getByRole("button", { name: "Check order", exact: true })
      .click();
  } else
    await surface
      .getByRole("button", { name: q.item.name, exact: true })
      .click();
}
try {
  for (const width of ciWidths([1280, 390])) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: "dark",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const errors = [];
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    await context.route("**/api/daily-score", (route) =>
      route.fulfill({ status: 404 }),
    );
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(`${day}T16:00:00Z`));
    for (const game of visualGames) {
      await page.goto(`${base}/${game}/`);
      try {
        await page.locator("#question-title").waitFor();
      } catch (error) {
        console.error({
          game,
          width,
          errors,
          body: await page.locator("body").innerText(),
        });
        throw error;
      }
      await assertEditorialUI(page);
      assert.equal(
        await page.locator(`.site-more a[href="/${game}/"]`).count(),
        0,
      );
      assert.ok(
        await page
          .locator("body")
          .evaluate((node) => node.scrollWidth <= innerWidth),
        `${game} overflows at ${width}`,
      );
      if (game !== "orderrot")
        assert.ok(
          await page.locator("#quiz img").evaluate(async (img) => {
            await img.decode();
            return img.naturalWidth > 100;
          }),
        );
      await page
        .getByRole("button", { name: "How to play", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      const questions = visualSet(game, data[game], day);
      for (const [index, q] of questions.entries()) {
        await solve(page, game, q);
        await page
          .locator("#visual-feedback")
          .filter({ hasText: "100 / 100 points" })
          .waitFor();
        if (index === 0) {
          // Reload a completed round: the next unanswered daily round is restored.
          await page.reload();
          try {
            await page.locator("#question-title").waitFor();
          } catch (error) {
            console.error({
              game,
              width,
              errors,
              body: await page.locator("body").innerText(),
            });
            throw error;
          }
          await assertEditorialUI(page);
        } else
          await page
            .getByRole("button", {
              name: index === 4 ? "See results" : "Next",
              exact: true,
            })
            .click();
      }
      await page
        .getByRole("heading", { name: "500 / 500 points", exact: true })
        .waitFor();
      await assertEditorialUI(page);
      await page
        .getByRole("button", { name: "Copy results", exact: true })
        .click();
      assert.match(
        await page.evaluate(() => navigator.clipboard.readText()),
        new RegExp(`${gameName(game)} ${day}`),
      );
      await page.reload();
      await page
        .getByRole("heading", { name: "500 / 500 points", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Play practice", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Show answer", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Show answer", exact: true })
        .click();
      await page
        .locator("#visual-feedback")
        .filter({ hasText: "Answer revealed" })
        .waitFor();
      await page.getByRole("button", { name: "Daily", exact: true }).click();
      await page
        .getByRole("heading", { name: "500 / 500 points", exact: true })
        .waitFor();
      // Dedicated Rush: correct answer, timed next round, timeout, recap.
      const before = await page.evaluate(() => JSON.stringify(localStorage));
      await page.goto(`${base}/rush/${game}/?date=${day}`);
      await page
        .locator("#rush-status")
        .filter({ hasText: `${gameName(game)} · Round 1` })
        .waitFor();
      assert.equal(await page.locator("#rush-clock").textContent(), "");
      const frame = page.frameLocator(
        "iframe:not(.feed-loading):not([hidden])",
      );
      await solve(
        frame,
        game,
        visualSet(game, data[game], await rushSeed(page, game), true, 0)[0],
      );
      await page
        .locator("#rush-status")
        .filter({ hasText: `${gameName(game)} · Round 2` })
        .waitFor();
      assert.match(await page.locator("#rush-clock").textContent(), /s$/);
      await page.clock.fastForward(60000);
      await page
        .getByRole("heading", { name: "Rush recap", exact: true })
        .waitFor();
      assert.match(
        await page.locator("#rush-score").textContent(),
        /^1 correct/,
      );
      const after = await page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(
            ([key]) => !key.startsWith("dailyo:rush:best:"),
          ),
        ),
      );
      const original = Object.fromEntries(
        Object.entries(JSON.parse(before)).filter(
          ([key]) => !key.startsWith("dailyo:rush:best:"),
        ),
      );
      assert.deepEqual(
        after,
        original,
        "Rush must preserve daily/practice storage",
      );
      console.log(
        `${width}px ${game}: daily, resume, practice, sharing, Rush success + timeout passed`,
      );
    }
    // Completed standalone daily sets are shared with the feed and appear in its recap.
    await page.goto(`${base}/daily/`);
    for (let i = 0; i < 9; i++) {
      await page
        .getByRole("button", { name: "Skip game", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Skip game", exact: true })
        .click();
    }
    await page
      .getByRole("heading", { name: "Daily recap", exact: true })
      .waitFor();
    assert.equal(await page.locator("#feed-results li").count(), 14);
    for (const [i, game] of visualGames.entries())
      assert.match(
        await page
          .locator("#feed-results li")
          .nth(9 + i)
          .textContent(),
        new RegExp(`${gameName(game)}.*500 / 500 points`),
      );
    assert.deepEqual(errors, []);
    await context.close();
  }
  if (ciShared()) {
    // Misses reveal a wider crop, hint use costs points, corrupt saves reset safely.
    const page = await browser.newPage();
    await page.clock.setFixedTime(new Date(`${day}T16:00:00Z`));
    await page.goto(`${base}/skyrot/`);
    await page.locator(".visual-choice").first().waitFor();
    const q = visualSet("skyrot", data.skyrot, day)[0];
    await page
      .getByRole("button", {
        name: q.options.find((x) => x.id !== q.item.id).name,
        exact: true,
      })
      .click();
    assert.equal(
      await page.locator(".visual-viewport").getAttribute("data-zoom"),
      "1",
    );
    await page.reload();
    await page.locator(".visual-choice").first().waitFor();
    assert.equal(
      await page.locator(".visual-viewport").getAttribute("data-zoom"),
      "1",
    );
    await page.getByRole("button", { name: q.item.name, exact: true }).click();
    await page
      .locator("#visual-feedback")
      .filter({ hasText: "65 / 100 points" })
      .waitFor();
    await page.evaluate(
      (day) =>
        localStorage.setItem(
          `dailyo:skyrot:v1:daily:${day}`,
          JSON.stringify({ seed: day, answers: [{}] }),
        ),
      day,
    );
    await page.reload();
    await page.locator(".visual-choice").first().waitFor();
    assert.equal(
      await page.locator(".visual-viewport").getAttribute("data-zoom"),
      "0",
    );
    // A wrong Rush guess must end the run, without waiting for a timeout.
    await page.goto(`${base}/rush/skyrot/?date=${day}`);
    await page
      .locator("#rush-status")
      .filter({ hasText: "From above · Round 1" })
      .waitFor();
    const rushQ = visualSet(
      "skyrot",
      data.skyrot,
      await rushSeed(page, "skyrot"),
      true,
      0,
    )[0];
    await page
      .frameLocator("iframe:not(.feed-loading):not([hidden])")
      .getByRole("button", {
        name: rushQ.options.find((x) => x.id !== rushQ.item.id).name,
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "See recap", exact: true }).click();
    await page
      .getByRole("heading", { name: "Rush recap", exact: true })
      .waitFor();
    assert.equal(await page.locator("#rush-score").textContent(), "0 correct");
    await page.route("**/games/media/skyrot-*", (route) =>
      route.fulfill({ status: 503 }),
    );
    await page.goto(`${base}/skyrot/`);
    await page
      .getByRole("button", { name: "Reload puzzle", exact: true })
      .waitFor();
    assert.equal(await page.locator(".visual-choice:enabled").count(), 0);
    await page.close();
    console.log(
      "Visual games browser checks passed at desktop and mobile sizes.",
    );
  }
} finally {
  await browser.close();
}
