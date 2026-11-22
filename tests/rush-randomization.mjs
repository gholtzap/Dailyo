import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { shuffle } from "../dist/daily/puzzles.js";
import { rushSeed, seedMixedRun } from "./rush-helpers.mjs";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch(),
  receipts = [];
await fs.mkdir("test-results", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      colorScheme: "dark",
    });
    // Fixed entropy makes the expected visible puzzles repeatable; every page
    // entry still has to ask for a new seed through the production run owner.
    await page.addInitScript(() => {
      if (window.parent !== window || location.origin === "null") return;
      const visit = Number(sessionStorage.getItem("test:rush-visits") ?? 0) + 1;
      sessionStorage.setItem("test:rush-visits", String(visit));
      let sequence = 0;
      Object.defineProperty(crypto, "randomUUID", {
        value: () =>
          `00000000-0000-4000-8000-${String(visit * 100 + ++sequence).padStart(12, "0")}`,
      });
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const ready = () =>
      page.locator("#rush-status").filter({ hasText: "Round 1" }).waitFor();
    await page.goto(`${base}/rush/flagrot/?date=2026-11-16`);
    await ready();
    const flags = await (
      await page.request.get(`${base}/games/data/flags.json`)
    ).json();
    const firstSeed = await rushSeed(page, "flags"),
      firstDeck = shuffle(flags, firstSeed);
    const firstImage = await page
      .frameLocator('iframe[title="flagrot"]')
      .locator(".flag")
      .getAttribute("src");
    assert.ok(firstImage.includes(encodeURIComponent(firstDeck[0].id)));
    await page.reload();
    await ready();
    const secondSeed = await rushSeed(page, "flags"),
      secondDeck = shuffle(flags, secondSeed);
    const secondImage = await page
      .frameLocator('iframe[title="flagrot"]')
      .locator(".flag")
      .getAttribute("src");
    assert.equal(
      secondSeed,
      firstSeed,
      "Refresh restores the same run, including a dated URL",
    );
    assert.deepEqual(
      secondDeck.map((x) => x.id),
      firstDeck.map((x) => x.id),
    );
    assert.equal(
      secondImage,
      firstImage,
      "Refresh must preserve the current puzzle",
    );
    assert.ok(secondImage.includes(encodeURIComponent(secondDeck[0].id)));

    const currentRun = new URL(
      await page.locator('iframe[title="flagrot"]').getAttribute("src"),
      base,
    ).searchParams.get("run");
    const nextFrame = page.locator('iframe[src*="rush=1"]');
    await nextFrame.waitFor({ state: "attached" });
    assert.equal(
      new URL(await nextFrame.getAttribute("src"), base).searchParams.get(
        "run",
      ),
      currentRun,
    );
    await page
      .frameLocator('iframe[title="flagrot"]')
      .getByRole("button", { name: secondDeck[0].name, exact: true })
      .click();
    await page.locator("#rush-status").filter({ hasText: "Round 2" }).waitFor();
    assert.equal(
      await rushSeed(page, "flags"),
      secondSeed,
      "Advancing consumes the same shuffled deck",
    );
    const secondRoundImage = await page
      .frameLocator('iframe[title="flagrot"]')
      .locator(".flag")
      .getAttribute("src");
    assert.ok(secondRoundImage.includes(encodeURIComponent(secondDeck[1].id)));
    await page.getByRole("button", { name: "Skip game", exact: true }).click();
    await page
      .getByRole("heading", { name: "Rush recap", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    await ready();
    const replaySeed = await rushSeed(page, "flags");
    assert.notEqual(replaySeed, secondSeed, "Play again starts a fresh run");

    // A failed child must retry the same run rather than rerolling its puzzle.
    await seedMixedRun(
      page,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    );
    await page.goto("about:blank");
    let fail = true;
    await page.route("**/games/data/flags.json", (route) => {
      if (!fail) return route.continue();
      fail = false;
      return route.fulfill({ status: 503 });
    });
    const failedRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/flags/" && url.searchParams.get("rush") === "0";
    });
    await page.goto(`${base}/rush/`);
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    const failedRun = new URL((await failedRequest).url()).searchParams.get(
      "run",
    );
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await ready();
    assert.equal((await rushSeed(page, "flags")).split(":").at(-1), failedRun);
    const seededFrames = await page
      .locator("iframe")
      .evaluateAll((frames) =>
        frames.map((f) => new URL(f.src).searchParams.get("run")),
      );
    assert.ok(seededFrames.length >= 2);
    assert.ok(
      seededFrames.every((seed) => seed === failedRun),
      "Preloaded games share the active run seed",
    );
    await page.screenshot({
      path: `test-results/${width}-rush-randomization.png`,
    });
    assert.deepEqual(errors, []);
    receipts.push({
      width,
      firstSeed,
      secondSeed,
      replaySeed,
      firstImage,
      secondImage,
      retryRun: failedRun,
      preloadedFrames: seededFrames.length,
    });
    await page.close();
    console.log(
      `${width}px: refresh, retry, next round, and preloaded games retain the run; replay starts a new run`,
    );
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/rush-randomization.json",
    JSON.stringify(receipts, null, 2),
  );
}

// Fresh mixed runs must shuffle actual visible games, not just the questions.
const { rushGames } = await import("../dist/daily/rush-games.js");
const expected = rushGames.map((g) => g.label).sort();
const mixedBrowser = await chromium.launch();
const orderReceipts = [];
try {
  for (const width of [390, 1440]) {
    const page = await mixedBrowser.newPage({
      viewport: { width, height: 844 },
      colorScheme: "dark",
    });
    await page.clock.install({ time: new Date("2026-11-22T17:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-22T17:00:01Z"));
    const ready = () =>
      page.locator("#rush-status").filter({ hasText: "Round 1" }).waitFor();
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("dailyo:rush:run:all")),
      );
    await page.goto(`${base}/rush/`);
    await ready();
    const first = await saved(),
      order = first.games.split(",");
    assert.deepEqual(
      [...order].sort(),
      expected,
      "Every eligible game exactly once",
    );
    assert.notDeepEqual(
      order,
      rushGames.map((g) => g.label),
      "A fresh run is shuffled",
    );
    for (let index = 0; index < order.length; index++) {
      await page.locator(`iframe[title="${order[index]}"]`).waitFor();
      if (index === 1) {
        await page.reload();
        await page
          .locator("#rush-status")
          .filter({ hasText: "Paused" })
          .waitFor();
        const restored = await saved();
        assert.equal(restored.games, first.games);
        assert.equal(restored.runId, first.runId);
        assert.equal(restored.index, index);
        await page.getByRole("button", { name: "Resume", exact: true }).click();
      }
      await page
        .getByRole("button", { name: "Skip game", exact: true })
        .click();
    }
    await page
      .getByRole("heading", { name: "Rush recap", exact: true })
      .waitFor();
    assert.deepEqual(
      (await page.locator("#feed-results li span").allTextContents()).map(
        (s) => s.split(" · ")[0],
      ),
      order,
    );
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    await ready();
    const second = await saved();
    assert.notEqual(second.runId, first.runId);
    assert.notEqual(
      second.games,
      first.games,
      "Replay reshuffles the game sequence",
    );
    assert.deepEqual(second.games.split(",").sort(), expected);
    await page.reload();
    await ready();
    assert.equal((await saved()).games, second.games);
    await page.addInitScript(() => {
      if (window.parent !== window || location.origin === "null") return;
      const order = sessionStorage.getItem("test:corrupt-order");
      if (!order) return;
      sessionStorage.removeItem("test:corrupt-order");
      const k = "dailyo:rush:run:all",
        saved = JSON.parse(sessionStorage.getItem(k));
      saved.games = JSON.parse(order).join(",");
      sessionStorage.setItem(k, JSON.stringify(saved));
    });
    for (const corrupt of [
      (a) => a.slice(1),
      (a) => [a[0], ...a.slice(0, -1)],
      (a) => ["cluerot", ...a.slice(1)],
    ]) {
      const prior = await saved();
      await page.evaluate(
        (order) =>
          sessionStorage.setItem("test:corrupt-order", JSON.stringify(order)),
        corrupt(prior.games.split(",")),
      );
      await page.reload();
      await ready();
      const repaired = await saved();
      assert.notEqual(repaired.runId, prior.runId);
      assert.deepEqual(repaired.games.split(",").sort(), expected);
    }
    orderReceipts.push({
      width,
      firstOrder: order,
      replayOrder: second.games.split(","),
      restored: true,
      rejectedMalformedOrders: true,
    });
    await page.close();
  }
} finally {
  await mixedBrowser.close();
  await fs.writeFile(
    "test-results/rush-game-order.json",
    JSON.stringify(orderReceipts, null, 2),
  );
}
console.log(
  "Mixed Rush order: every eligible game once, replay shuffle, refresh position, recap alignment and malformed saves passed at mobile/desktop.",
);
