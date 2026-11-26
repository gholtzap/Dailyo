import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true }),
  reports = [];
try {
  for (const width of [390, 1440])
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        colorScheme,
      });
      await page.goto(
        new URL(
          "/trainrot/",
          process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173",
        ).href,
      );
      await page.locator("#reveal").waitFor();
      assert.equal(
        await page.locator("meta[name=theme-color]").getAttribute("content"),
        "#fff8ec",
      );
      const actual = await page.evaluate(() => ({
        scheme: getComputedStyle(document.documentElement).colorScheme,
        background: getComputedStyle(document.querySelector(".planner"))
          .backgroundColor,
        land: getComputedStyle(document.querySelector("#city-map path")).fill,
        water: getComputedStyle(document.querySelector(".map-panel"))
          .backgroundColor,
      }));
      assert.deepEqual(actual, {
        scheme: "light",
        background: "rgb(255, 248, 236)",
        land: "rgb(245, 237, 223)",
        water: "rgb(227, 233, 228)",
      });
      const helpButton = page.getByRole("button", {
        name: "How to play",
        exact: true,
      });
      const helpDialog = page.getByRole("dialog", { name: "How to play" });
      await helpButton.press("Enter");
      await helpDialog.waitFor();
      assert.equal(
        await helpDialog.evaluate((n) => getComputedStyle(n).backgroundColor),
        "rgb(255, 248, 236)",
      );
      await helpDialog
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await helpDialog.waitFor({ state: "hidden" });
      assert.equal(
        await helpButton.evaluate((n) => n === document.activeElement),
        true,
      );
      await helpButton.click();
      await helpDialog.waitFor();
      await page.keyboard.press("Escape");
      await helpDialog.waitFor({ state: "hidden" });
      await page.screenshot({
        path: `test-results/${width}-${colorScheme}-dark-default.png`,
        fullPage: true,
      });
      reports.push({ width, systemPreference: colorScheme, ...actual });
      await page.close();
    }
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await fs.mkdir("test-results", { recursive: true });
  await fs.writeFile(
    "test-results/dark-theme.json",
    JSON.stringify(reports, null, 2),
  );
  await browser.close();
}
