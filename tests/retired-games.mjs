import { boardGames } from "../dist/games/board-catalog.js";
import { ciWidths } from "./ci-parts.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { retiredGames } from "../dist/retired-games.js";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const output = "test-results/retired-games";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const receipts = [],
  reports = [];
const retiredLabels = [
  "Angles",
  "Split",
  "Estimates",
  "Rhythm",
  "Count",
  "Sort",
  "Track",
];
try {
  for (const viewport of policy.viewports.filter((v) =>
    ciWidths([390, 1440]).includes(v.width),
  ))
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport, colorScheme });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/daily-score", (route) =>
        route.fulfill({ status: 404 }),
      );
      await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
      // Existing skips for retired games must not affect the new Daily roster.
      await page.addInitScript((retired) => {
        localStorage.setItem(
          "dailyo:daily-feed:skipped:2026-11-26",
          JSON.stringify(retired),
        );
      }, retiredGames);
      for (const mix of ["daily", "rush"]) {
        for (const game of retiredGames) {
          await page.goto(
            `${base}/${mix === "rush" ? "rush/" : ""}${game}/?practice=1`,
          );
          await page.waitForURL(`${base}/${mix}/`);
          await page.locator(".site-masthead").waitFor();
          assert.equal(
            await page.locator(`iframe[title="${game}"]`).count(),
            0,
          );
        }
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        await page.goto(`${base}/${mix}/`);
        await page.locator("iframe:not(.feed-loading)").first().waitFor();
        const menu = page.locator(".site-more");
        await menu.locator("summary").press("Enter");
        const labels = await menu.locator("a span").allTextContents();
        for (const label of retiredLabels)
          assert.ok(!labels.includes(label), label);
        assert.equal(
          labels.length,
          (mix === "rush" ? 8 : 15) + boardGames.length,
        ); // Daily's directory includes Subway cities.
        reports.push({
          viewport,
          colorScheme,
          state: `${mix}-menu`,
          ...(await checkPage(page, policy)),
        });
        await page.screenshot({
          path: `${output}/${viewport.width}-${colorScheme}-${mix}-menu.png`,
          fullPage: true,
        });
        await menu.locator("summary").press("Enter");
        if (mix === "daily") {
          for (let round = 0; round < 14; round++) {
            await page
              .locator("#feed-progress")
              .filter({ hasText: `${round + 1} of 14` })
              .waitFor();
            await page.locator("#feed-skip").click();
          }
        } else {
          for (let round = 0; round < 8; round++) {
            if (
              await page
                .getByRole("button", { name: "Resume", exact: true })
                .isVisible()
            )
              await page
                .getByRole("button", { name: "Resume", exact: true })
                .click();
            await page
              .locator("#rush-status")
              .filter({ hasText: "Round 1" })
              .waitFor();
            const title = await page
              .locator("iframe[title]:not([hidden])")
              .getAttribute("title");
            assert.ok(!retiredGames.includes(title));
            await page
              .getByRole("button", { name: "Skip game", exact: true })
              .click();
          }
        }
        await page
          .getByRole("heading", {
            name: mix === "daily" ? "Daily recap" : "Rush recap",
          })
          .waitFor();
        if (mix === "rush")
          await page.locator(".rush-breakdown > summary").click();
        assert.equal(
          await page.locator("#feed-results li").count(),
          mix === "daily" ? 14 : 8,
        );
        for (const label of retiredLabels)
          assert.equal(
            await page
              .locator("#feed-results li strong")
              .filter({ hasText: new RegExp(`^${label}$`) })
              .count(),
            0,
          );
        reports.push({
          viewport,
          colorScheme,
          state: `${mix}-recap`,
          ...(await checkPage(page, policy)),
        });
        await page.screenshot({
          path: `${output}/${viewport.width}-${colorScheme}-${mix}-recap.png`,
          fullPage: true,
        });
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
      }
      assert.deepEqual(errors, []);
      receipts.push({
        viewport,
        colorScheme,
        redirects: retiredGames.length * 2,
        daily: 14,
        rush: 8,
      });
      await page.close();
    }
} finally {
  for (const page of browser.contexts().flatMap((context) => context.pages())) {
    await page.screenshot({ path: `${output}/last-state.png`, fullPage: true });
  }
  await browser.close();
  await fs.writeFile(
    `${output}/receipt.json`,
    JSON.stringify(
      { base, command: "node tests/retired-games.mjs", receipts, reports },
      null,
      2,
    ),
  );
}
assert.deepEqual(
  reports.flatMap((r) => r.findings),
  [],
);
console.log(
  "Retired games: redirects, menus, complete Daily/Rush rotations and recaps; mobile/desktop, both system preferences, UI policy passed.",
);
