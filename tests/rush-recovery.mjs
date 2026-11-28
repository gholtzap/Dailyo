import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { shuffle } from "../dist/daily/puzzles.js";
import { rushSeed, seedMixedRun } from "./rush-helpers.mjs";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(
  await fs.readFile(new URL("../ui-policy.json", import.meta.url)),
);
const lint = process.argv.includes("--ui"),
  reports = [];
const browser = await chromium.launch();
await fs.mkdir("test-results/rush-recovery", { recursive: true });
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({
      viewport,
      colorScheme: "dark",
      isMobile: viewport.width === 390,
      hasTouch: viewport.width === 390,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date("2026-11-20T16:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-20T16:00:01Z"));
    const status = page.locator("#rush-status"),
      timer = page.locator("#rush-clock");
    const inspect = async (state) => {
      if (!lint) return;
      await page.clock.resume();
      reports.push({
        width: viewport.width,
        state,
        ...(await checkPage(page, policy)),
      });
      const frame = await (
        await page.locator("iframe[title]").elementHandle()
      ).contentFrame();
      reports.push({
        width: viewport.width,
        state: `${state}-game`,
        ...(await checkPage(frame, policy)),
      });
      await page.clock.pauseAt(
        await page.evaluate(() => new Date(Date.now() + 100).toISOString()),
      );
    };
    await page.goto(`${base}/rush/flagrot/`);
    await status.filter({ hasText: "Round 1" }).waitFor();
    const firstSeed = await rushSeed(page, "flags");
    const flags = await (
      await page.request.get(`${base}/games/data/flags.json`)
    ).json();
    const deck = shuffle(flags, firstSeed);
    const flag = page.frameLocator("iframe[title=flagrot]");
    await flag.getByRole("button", { name: deck[0].name, exact: true }).click();
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.clock.runFor(200);
    await status.filter({ hasText: "Round 2" }).waitFor();
    await page
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await status.filter({ hasText: "Paused" }).waitFor({ timeout: 3000 });
    await page.clock.runFor(20000);
    assert.equal(await timer.innerText(), "8");
    assert.doesNotMatch(
      await flag.locator("dialog").innerText(),
      /five daily/i,
    );
    assert.match(await flag.locator("dialog").innerText(), /clock|time/i);
    assert.equal(
      await flag.locator("#quiz").isVisible(),
      false,
      "The puzzle must be hidden while help remains usable",
    );
    assert.equal(
      await flag
        .getByRole("button", { name: "Close", exact: true })
        .isVisible(),
      true,
    );
    await inspect("help");
    await page.screenshot({
      path: `test-results/rush-recovery/${viewport.width}-help.png`,
    });
    await flag.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
    assert.equal(await flag.locator("#quiz").isVisible(), false);
    await inspect("paused");
    await page.reload();
    await status.filter({ hasText: "Paused" }).waitFor();
    assert.equal(await rushSeed(page, "flags"), firstSeed);
    assert.equal(await timer.innerText(), "8");
    await page.clock.runFor(12000);
    assert.equal(await timer.innerText(), "8");
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await status.filter({ hasText: "Round 2" }).waitFor();
    assert.equal(await flag.locator("#quiz").isVisible(), true);
    await page.clock.runFor(2000);
    await page.reload();
    await status.filter({ hasText: "Paused" }).waitFor();
    assert.equal(
      await timer.innerText(),
      "6",
      "Reload must preserve elapsed time",
    );
    let failReload = true;
    await page.route("**/games/data/flags.json", (route) => {
      // Fail the restored active round, not an in-flight preload from the old page.
      if (
        failReload &&
        new URL(route.request().frame().url()).searchParams.get("rush") === "1"
      ) {
        failReload = false;
        return route.fulfill({ status: 503 });
      }
      return route.continue();
    });
    await page.reload();
    await status.filter({ hasText: "Flags didn’t load." }).waitFor();
    await page.reload();
    await status.filter({ hasText: "Paused" }).waitFor();
    assert.equal(
      await timer.innerText(),
      "6",
      "A failed reload must not reset the saved time budget",
    );
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await flag.getByRole("button", { name: deck[1].name, exact: true }).click();
    // Refresh during feedback must count the answer exactly once and restore the next puzzle.
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.reload();
    await status.filter({ hasText: "Paused" }).waitFor();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await status.filter({ hasText: "Round 3" }).waitFor();
    await page.getByRole("button", { name: "Skip game", exact: true }).click();
    await page.getByRole("heading", { name: "Rush recap" }).waitFor();
    assert.match(await page.locator("#rush-score").innerText(), /^2 correct/);
    await page.reload();
    await page.getByRole("heading", { name: "Rush recap" }).waitFor();
    assert.match(await page.locator("#rush-score").innerText(), /^2 correct/);
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.notEqual(await rushSeed(page, "flags"), firstSeed);

    const enter = async (name) => {
      await page.goto(`${base}/rush/${name}/`);
      await status.filter({ hasText: "Round 1" }).waitFor();
      return page.frameLocator(`iframe[title=${name}]`);
    };
    const map = await enter("maprot");
    await map.locator(".rot-picking").press("ArrowRight");
    const pin = await map.locator(".rot-coordinate").innerText();
    await page.reload();
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.equal(await map.locator(".rot-coordinate").innerText(), pin);

    const order = await enter("orderrot");
    await order.locator(".visual-order button:not(:disabled)").first().click();
    const arrangement = await order
      .locator(".visual-order li > span")
      .allTextContents();
    await page.reload();
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.deepEqual(
      await order.locator(".visual-order li > span").allTextContents(),
      arrangement,
    );

    const train = await enter("trainrot");
    await train.locator("button[data-route]").first().click();
    const route = await train.locator(".sequence-row").innerText();
    await page.reload();
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.equal(await train.locator(".sequence-row").innerText(), route);

    await seedMixedRun(page, "2026-11-20");
    await page.goto(base);
    await status.filter({ hasText: "Round 1" }).waitFor();
    const mixed = shuffle(flags, await rushSeed(page, "flags"));
    await flag
      .getByRole("button", { name: mixed[0].name, exact: true })
      .click();
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.clock.runFor(200);
    await status.filter({ hasText: "Round 2" }).waitFor();
    await page.clock.runFor(2000);
    await page.route(
      "**/games/data/flags.json",
      (route) => route.fulfill({ status: 503 }),
      { times: 1 },
    );
    await page.reload();
    await status.filter({ hasText: "Flags didn’t load." }).waitFor();
    await page.getByRole("button", { name: "Skip game", exact: true }).click();
    await status
      .filter({ hasText: "Languages · Round 1" })
      .waitFor({ timeout: 3000 });
    assert.equal(
      await timer.innerText(),
      "8",
      "Skipping a failed recovery must give the next game its own budget",
    );

    await page.evaluate(() =>
      sessionStorage.setItem(
        "dailyo:rush:run:flagrot",
        JSON.stringify({ date: "2026-11-20", index: -1, scores: [-100] }),
      ),
    );
    await page.goto(`${base}/rush/flagrot/`);
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.equal(
      await timer.innerText(),
      "",
      "Invalid checkpoints must start a usable fresh run",
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${viewport.width}px: help, concealed pause, timed and untimed recovery, feedback, recap, replay, and multi-step draft`,
    );
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/rush-recovery/ui.json",
    JSON.stringify(reports, null, 2),
  );
}
if (reports.some((r) => r.findings.length)) process.exitCode = 1;
