import { ciWidths } from "./ci-parts.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
import { individualRushGames } from "../dist/daily/rush-games.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const output = `test-results/app-layout/${engine.name()}`;
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
await fs.mkdir(output, { recursive: true });
const browser = await engine.launch(),
  reports = [],
  receipts = [];
async function fit(page) {
  await page.waitForFunction(() => {
    const f = document.querySelector("iframe[title]:not([hidden])");
    return (
      f &&
      !f.classList.contains("feed-loading") &&
      f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 2
    );
  });
}
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 620 },
    { width: 1440, height: 1000 },
  ].filter((viewport) => ciWidths([320, 390, 1440]).includes(viewport.width))) {
    for (const game of individualRushGames) {
      const page = await browser.newPage({
        viewport,
        colorScheme: "light",
        hasTouch: viewport.width < 600,
      });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
      await page.addInitScript(
        () =>
          (crypto.randomUUID = () => "00000000-0000-4000-8000-000000000031"),
      );
      await page.goto(`${base}/rush/${game.label.toLowerCase()}/`);
      const help = page.getByRole("button", {
        name: "How to play",
        exact: true,
      });
      await help.waitFor();
      await fit(page);
      const child = page.frameLocator(`iframe[title="${game.label}"]`);
      assert.equal(
        await page
          .getByRole("button", { name: "Review answer", exact: true })
          .isVisible(),
        false,
        "A fresh run has no previous answer",
      );
      const opening = await page.locator("iframe[title]").evaluate((f) => ({
        height: f.clientHeight,
        main: f.contentDocument.querySelector("main").getBoundingClientRect()
          .height,
      }));
      assert.ok(
        opening.height - opening.main <= 2,
        "Every Rush card must fit its content",
      );
      const sample = child.locator(".sample");
      if (await sample.count()) {
        const padding = await sample.evaluate((n) => {
          const a = n.getBoundingClientRect(),
            b = n.parentElement.getBoundingClientRect();
          return {
            left: a.left - b.left,
            right: b.right - a.right,
            top: a.top - b.top,
            bottom: b.bottom - a.bottom,
          };
        });
        assert.ok(
          Object.values(padding).every((n) => n >= 15),
          "Language text needs padding on every side",
        );
      }
      if (await child.locator(".flag").count())
        assert.ok(
          (await child.locator(".flag").boundingBox()).height >= 144,
          "Flags must not shrink with their iframe viewport",
        );
      const choices = await child
        .locator(".choices > button")
        .evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().height));
      if (choices.length)
        assert.ok(
          Math.max(...choices) - Math.min(...choices) < 2,
          "All answer rows share a height when text wraps",
        );
      await page.screenshot({
        path: `${output}/${viewport.width}-${game.label}-opening.png`,
      });
      await help.click();
      await child.getByRole("dialog").waitFor();
      await page.waitForFunction(() => {
        const f = document.querySelector("iframe[title]"),
          d = f.contentDocument.querySelector("dialog[open]");
        return d && d.scrollHeight <= d.clientHeight + 2;
      });
      await page.screenshot({
        path: `${output}/${viewport.width}-${game.label}-help.png`,
      });
      await child.getByRole("button", { name: "Close", exact: true }).click();
      await fit(page);
      if (["flagrot", "langrot", "Vocabulary"].includes(game.label)) {
        await child.locator(".choice").first().click();
        await page
          .getByRole("button", { name: "Keep answer", exact: true })
          .click();
        const announcement = await child
          .locator("#answer-feedback")
          .evaluate((n) => {
            const r = n.getBoundingClientRect();
            return {
              position: getComputedStyle(n).position,
              width: r.width,
              height: r.height,
            };
          });
        assert.ok(
          announcement.position === "absolute" &&
            announcement.width <= 1 &&
            announcement.height <= 1,
          "The accessible announcement must not reserve an empty grid row",
        );
        await fit(page);
        await page.screenshot({
          path: `${output}/${viewport.width}-${game.label}-feedback.png`,
        });
      }
      // Recover a saved second-round fixture to exercise the shared timed header and Pause.
      await page.addInitScript(
        ({ game }) =>
          window === parent &&
          sessionStorage.setItem(
            `dailyo:rush:run:${game.label.toLowerCase()}`,
            JSON.stringify({
              date: "2026-11-26",
              games: game.label,
              runId: "00000000-0000-4000-8000-000000000031",
              index: 0,
              round: 1,
              remaining: game.seconds[0] * 1000,
              scores: [1],
              streak: 1,
            }),
          ),
        { game },
      );
      await page.reload();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await help.waitFor();
      await fit(page);
      const actions = await page.locator(".feed-actions").evaluate((n) => {
        const outer = n.getBoundingClientRect();
        return [...n.querySelectorAll("button")]
          .filter((e) => e.checkVisibility())
          .map((e) => {
            const r = e.getBoundingClientRect();
            return {
              text: e.textContent,
              left: r.left - outer.left,
              right: outer.right - r.right,
              top: r.top,
              bottom: r.bottom,
            };
          });
      });
      assert.ok(
        actions.every((r) => r.left >= 8 && r.right >= 8),
        "Timed header controls remain inside the card",
      );
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
      await page.waitForFunction(() => {
        const card = document
          .querySelector(".feed-body")
          .getBoundingClientRect();
        const overlay = document
          .querySelector("#rush-resume-panel")
          .getBoundingClientRect();
        return overlay.bottom <= card.bottom && overlay.top >= card.top;
      });
      await page.screenshot({
        path: `${output}/${viewport.width}-${game.label}-paused.png`,
      });
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      if (engine === chromium) {
        const frame = await (
          await page.locator("iframe[title]").elementHandle()
        ).contentFrame();
        reports.push({
          game: game.label,
          viewport,
          state: "host",
          ...(await checkPage(page, policy)),
        });
        reports.push({
          game: game.label,
          viewport,
          state: "game",
          ...(await checkPage(frame, policy)),
        });
      }
      assert.deepEqual(errors, []);
      receipts.push({ game: game.label, viewport, ...opening });
      console.log(
        engine.name(),
        viewport.width,
        game.label,
        "opening, Help, timed header, pause passed",
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
await fs.writeFile(`${output}/receipt.json`, JSON.stringify(receipts, null, 2));
await fs.writeFile(`${output}/ui.json`, JSON.stringify(reports, null, 2));
assert.deepEqual(
  reports.flatMap((r) => r.findings.filter((f) => f.status !== "unresolved")),
  [],
);
