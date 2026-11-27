import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";

// Run against the built app: node tests/block-party.mjs.
// Screenshots and UI findings cover every game, Help, and both viewport sizes.
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const output = "test-results/block-party";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const routes = [
  "flags",
  "languages",
  "vocabulary",
  "maprot",
  "yearrot",
  "borderrot",
  "ladderrot",
  "cluerot",
  "skyrot",
  "pricerot",
  "skylinerot",
  "zoomrot",
  "orderrot",
  "trainrot",
  "trainrot-world/london",
];
const browser = await chromium.launch();
const reports = [];
await fs.mkdir(output, { recursive: true });
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({
      viewport,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error(page.url(), error.message);
    });
    await page.route("**/api/daily-score", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
    const inspect = async (route, state) => {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route}: overflow`,
      );
      try {
        reports.push({
          route,
          state,
          viewport,
          ...(await checkPage(page, policy)),
        });
      } catch (error) {
        if (!String(error).includes("5000 element limit")) throw error;
        reports.push({
          route,
          state,
          viewport,
          findings: [],
          incomplete: String(error),
        });
      }
      await page.screenshot({
        path: `${output}/${viewport.width}-${route.replaceAll("/", "-")}-${state}.png`,
        fullPage: true,
      });
    };
    for (const route of routes) {
      await page.goto(`${base}/${route}/`);
      const help = page.getByRole("button", {
        name: "How to play",
        exact: true,
      });
      await help.waitFor();
      if (route.startsWith("trainrot")) await page.locator("#reveal").waitFor();
      else
        await page.waitForFunction(
          () =>
            !document.querySelector("#quiz")?.textContent?.includes("Loading"),
        );
      assert.equal(
        await page.locator("meta[name=theme-color]").getAttribute("content"),
        "#0b1428",
      );
      if (route === "flags") {
        const colours = await page
          .locator(".choice")
          .evaluateAll((tiles) =>
            tiles.map((tile) => getComputedStyle(tile).backgroundColor),
          );
        assert.equal(
          new Set(colours).size,
          4,
          "Answer pieces have four distinct colours",
        );
        assert.ok(
          await page
            .locator(".choice")
            .evaluateAll((tiles) =>
              tiles.every(
                (tile) => getComputedStyle(tile).boxShadow !== "none",
              ),
            ),
          "Answer pieces retain their tactile edges",
        );
        await page.locator(".choice").first().hover();
        assert.equal(
          await page
            .locator(".choice")
            .first()
            .evaluate((tile) => getComputedStyle(tile).backgroundColor),
          colours[0],
          "Hover keeps the piece colour",
        );
        await page.mouse.move(0, 0);
      }
      if (route === "anglerot") {
        const board = page.getByRole("slider", {
          name: "Draw angle",
          exact: true,
        });
        await board.press("Home");
        await board.press("PageUp");
        assert.equal(await board.getAttribute("aria-valuenow"), "10");
        assert.equal(
          await page
            .getByRole("button", { name: "Check angle", exact: true })
            .isEnabled(),
          true,
        );
      }
      if (route === "swaprot") {
        const colour = await page
          .locator(".swap-tile")
          .nth(1)
          .evaluate((tile) => getComputedStyle(tile).backgroundColor);
        await page.locator(".swap-tile").nth(1).click();
        assert.equal(
          await page.locator(".swap-tile[aria-pressed=true]").count(),
          1,
        );
        assert.equal(
          await page
            .locator(".swap-tile")
            .nth(1)
            .evaluate((tile) => getComputedStyle(tile).backgroundColor),
          colour,
          "Selection keeps the piece colour",
        );
      }
      await inspect(route, "play");
      await help.press("Enter");
      await page
        .getByRole("dialog", { name: "How to play", exact: true })
        .waitFor();
      await inspect(route, "help");
      await page.keyboard.press("Escape");
      assert.equal(
        await help.evaluate((node) => node === document.activeElement),
        true,
      );
      console.log(`${viewport.width} ${route}: play and Help`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(`${output}/ui.json`, JSON.stringify(reports, null, 2));
}
const findings = reports.flatMap((report) => report.findings);
console.log(
  `${reports.length} UI states checked; ${findings.length} findings. Artifacts: ${output}`,
);
assert.deepEqual(
  reports
    .filter((report) => report.incomplete)
    .map((report) => ({
      route: report.route,
      state: report.state,
      viewport: report.viewport,
      incomplete: report.incomplete,
    })),
  [],
);
assert.deepEqual(findings, []);
