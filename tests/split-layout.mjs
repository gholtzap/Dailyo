import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
import { perceptionPuzzle } from "../dist/games/perception-puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const output = "test-results/split-layout";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
await fs.mkdir(output, { recursive: true });
const reports = [];
for (const engine of [process.argv.includes("--webkit") ? webkit : chromium]) {
  const browser = await engine.launch();
  try {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 674 },
      { width: 1440, height: 1000 },
    ]) {
      for (const colorScheme of ["light", "dark"]) {
        const page = await browser.newPage({
          viewport,
          colorScheme,
          hasTouch: viewport.width < 600,
          isMobile: viewport.width < 600,
        });
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.clock.install({ time: new Date("2026-11-26T17:00:00Z") });
        await page.clock.pauseAt(new Date("2026-11-26T17:00:01Z"));
        await page.goto(`${base}/rush/splitrot/`);
        const child = page.frameLocator("iframe[title=splitrot]");
        const slider = child.getByRole("slider", { name: "Split position" });
        await slider.waitFor();
        await page.clock.runFor(100);
        await page.waitForFunction(() => {
          const frame = document.querySelector("iframe[title=splitrot]");
          return (
            frame?.contentDocument?.documentElement.scrollHeight <=
            frame.clientHeight + 2
          );
        });
        assert.equal(await child.locator("input[type=range]").count(), 1);
        assert.equal(
          await child.locator(".split-field input[type=range]").count(),
          1,
        );
        assert.equal(
          await child.getByText(/^(Split position|Left|Right)$/).count(),
          0,
        );
        const help = page.getByRole("button", {
          name: "How to play",
          exact: true,
        });
        const header = await page.locator("#rush-round").boundingBox();
        const helpBox = await help.boundingBox();
        assert.ok(
          Math.abs(header.y - helpBox.y) < 24,
          "Help belongs in the round header",
        );
        const field = await child.locator(".split-field").boundingBox();
        const rail = await child.locator(".split-rail").boundingBox();
        assert.ok(
          rail.x - field.x >= 24 &&
            field.x + field.width - rail.x - rail.width >= 24,
        );
        const button = await child
          .getByRole("button", { name: "Check split", exact: true })
          .boundingBox();
        assert.ok(
          button.y + button.height < viewport.height,
          "Answer fits the initial phone screen",
        );
        const board = await page.locator(".feed-body").boundingBox();
        assert.ok(
          board.height < 420,
          "Card fits the puzzle instead of filling the viewport",
        );
        if (viewport.width === 390 && colorScheme === "dark") {
          await page.screenshot({
            path: `${output}/${engine.name()}-opening.png`,
          });
        }
        // Operate the real native control with a pointer, then with the keyboard.
        const point = [rail.x + rail.width * 0.65, rail.y + rail.height / 2];
        if (viewport.width < 600) await page.touchscreen.tap(...point);
        else await page.mouse.click(...point);
        assert.ok(Math.abs(Number(await slider.inputValue()) - 65) < 1);
        await slider.press("Home");
        assert.equal(Number(await slider.inputValue()), 0);
        await slider.press("End");
        assert.equal(Number(await slider.inputValue()), 100);
        await slider.press("ArrowLeft");
        assert.equal(Number(await slider.inputValue()), 99.9);
        await slider.fill("65");
        await help.click();
        await child.getByRole("dialog").waitFor();
        if (viewport.width === 390 && colorScheme === "dark")
          await page.screenshot({
            path: `${output}/${engine.name()}-help.png`,
          });
        await child.getByRole("button", { name: "Close", exact: true }).click();
        const resume = page.getByRole("button", {
          name: "Resume",
          exact: true,
        });
        if (await resume.isVisible()) await resume.click();
        assert.equal(
          Number(await slider.inputValue()),
          65,
          "Help preserves the guess",
        );
        const q = perceptionPuzzle(
          "splitrot",
          await rushSeed(page, "splitrot"),
          0,
        );
        await slider.fill(
          String(
            Number(((q.right ? 1 - q.target : q.target) * 100).toFixed(1)),
          ),
        );
        await child
          .getByRole("button", { name: "Check split", exact: true })
          .click();
        await child
          .locator("#perception-feedback")
          .filter({ hasText: "Correct" })
          .waitFor();
        await page.clock.resume();
        await page.waitForFunction(() => {
          const frame = document.querySelector("iframe[title=splitrot]");
          return (
            frame.contentDocument.documentElement.scrollHeight <=
            frame.clientHeight + 2
          );
        });
        await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
        assert.equal(await child.locator(".split-answer").count(), 1);
        if (viewport.width === 390 && colorScheme === "dark")
          await page.screenshot({
            path: `${output}/${engine.name()}-feedback.png`,
          });
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await child.getByRole("slider", { name: "Split position" }).waitFor();
        await page
          .getByRole("button", { name: "Review answer", exact: true })
          .click();
        const review = page.frameLocator('iframe[title="Previous answer"]');
        await review.locator(".split-answer").waitFor();
        await help.click();
        await review.getByRole("dialog").waitFor();
        await review
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Back to puzzle", exact: true })
          .click();
        if (await resume.isVisible()) await resume.click();
        await slider.click();
        await slider.fill("65");
        await page.clock.runFor(100);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        assert.equal(
          await child
            .locator("body")
            .evaluate(
              () => getComputedStyle(document.documentElement).colorScheme,
            ),
          "dark",
        );
        assert.deepEqual(errors, []);
        const name = `${engine.name()}-${viewport.width}-${colorScheme}`;
        await page.screenshot({
          path: `${output}/${name}.png`,
          fullPage: true,
        });
        if (engine === chromium && colorScheme === "dark") {
          await page.clock.resume();
          reports.push({
            name,
            state: "host",
            ...(await checkPage(page, policy)),
          });
          const frame = await (
            await page.locator("iframe[title=splitrot]").elementHandle()
          ).contentFrame();
          reports.push({
            name,
            state: "puzzle",
            ...(await checkPage(frame, policy)),
          });
        }
        console.log(
          `${name}: layout, pointer, keyboard, Help, scoring, review passed`,
        );
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
await fs.writeFile(
  `${output}/${process.argv.includes("--webkit") ? "webkit" : "chromium"}-report.json`,
  JSON.stringify(reports, null, 2),
);
assert.ok(
  reports.every((r) => r.findings.every((f) => f.status === "unresolved")),
  "Confirmed UI policy issues: see report.json",
);
