import { rushSeed } from "./rush-helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(
  await fs.readFile(new URL("../ui-policy.json", import.meta.url)),
);
const reports = [];
const lint = process.argv.includes("--ui");
const browser = await chromium.launch();
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({ viewport, colorScheme: "dark" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const start = new Date("2026-11-19T16:00:00Z");
    await page.clock.install({ time: new Date(start - 1000) });
    await page.clock.pauseAt(start);
    await page.route("**/api/daily-score", (r) => r.fulfill({ status: 404 }));
    const inspect = async (state) => {
      await page.clock.resume();
      if (lint)
        reports.push({ viewport, state, ...(await checkPage(page, policy)) });
      await page.screenshot({
        path: `test-results/${viewport.width}-automatic-${state}.png`,
      });
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    };
    const train = page.frameLocator('iframe[title="trainrot"]');
    await page.goto(`${base}/daily/`);
    await train.locator("#show-answer").click();
    await page.locator("#feed-next").waitFor();
    await inspect("daily-feedback");
    await page.clock.fastForward(10000);
    assert.equal(await page.locator("#feed-progress").textContent(), "1 of 14");
    await page.locator("#feed-next").click();
    await page
      .frameLocator('iframe[title="flagrot"]')
      .locator(".choice")
      .first()
      .waitFor();
    assert.equal(await page.locator("#feed-progress").textContent(), "2 of 14");
    await inspect("daily-advanced");

    // Reload skips completed games; each newly completed game waits for Next.
    await page.goto(`${base}/daily/`);
    await page
      .frameLocator('iframe[title="flagrot"]')
      .locator(".choice")
      .first()
      .waitFor();
    // Complete the five questions through the actual game controls.
    const flags = page.frameLocator('iframe[title="flagrot"]');
    for (let i = 0; i < 5; i++) {
      await flags.locator(".choice").first().click();
      await flags.locator("#next").click();
    }
    await page.locator("#feed-next").waitFor();
    await page.locator("#feed-next").click();
    await page
      .frameLocator('iframe[title="langrot"]')
      .locator(".choice")
      .first()
      .waitFor();
    await page.clock.fastForward(2500);
    assert.equal(await page.locator("#feed-progress").textContent(), "3 of 14");

    // A miss automatically ends a single-game run and opens the recap.
    await page.goto(`${base}/rush/flagrot/`);
    await flags.locator(".choice").first().waitFor();
    const flagData = await (
      await page.request.get(`${base}/games/data/flags.json`)
    ).json();
    const { shuffle } = await import("../dist/daily/puzzles.js");
    const answer = shuffle(flagData, await rushSeed(page, "flags"))[0];
    await flags
      .locator(".choice")
      .filter({ hasNotText: answer.name })
      .first()
      .click();
    await page.locator("#rush-status").filter({ hasText: "Missed" }).waitFor();
    await inspect("rush-missed");
    await page.clock.fastForward(2400);
    await page.locator("#feed-recap").waitFor();
    await inspect("rush-recap");

    // All Rush Trainrot maps must hide the network, including assisted rounds.
    await page.goto(`${base}/rush/trainrot/`);
    await train.locator("#reveal").waitFor();
    assert.match(
      await train.locator("#city-map").getAttribute("aria-label"),
      /lines are hidden/,
    );
    assert.equal(await train.locator(".map-hint").count(), 0);
    assert.equal(await train.locator("#city-map path[opacity]").count(), 0);
    await inspect("rush-train");

    // Exercise NYC presentation with the local fixture's map-name override.
    await page.route("**/data/network.json", async (route) => {
      const response = await route.fetch(),
        network = await response.json();
      delete network.metadata.mapName;
      await route.fulfill({ json: network });
    });
    await page.goto(`${base}/trainrot/?practice=1`);
    await page.locator("#reveal").waitFor();
    assert.equal(await page.locator(".map-hint").count(), 0);
    assert.match(
      await page.locator("#city-map").getAttribute("aria-label"),
      /lines are hidden/,
    );
    await page.locator("#show-answer").click();
    await page.locator(".route-path").first().waitFor({ state: "attached" });
    await page.locator("#next").click();
    assert.equal(await page.locator(".route-path").count(), 0);
    assert.match(
      await page.locator("#city-map").getAttribute("aria-label"),
      /lines are hidden/,
    );
    await inspect("nyc-planning");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${viewport.width}px: manual Daily and automatic Rush advancement, hidden train maps, and result reset passed`,
    );
  }
} finally {
  await browser.close();
  await fs.mkdir("test-results", { recursive: true });
  if (lint)
    await fs.writeFile(
      "test-results/automatic-progression-ui.json",
      JSON.stringify(reports, null, 2),
    );
}
if (reports.some((report) => report.findings.length)) process.exitCode = 1;
