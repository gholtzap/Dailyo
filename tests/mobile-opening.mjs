import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const output = "test-results/mobile-opening";
await fs.mkdir(output, { recursive: true });
const reports = [];
const { rushGames } = await import("../dist/daily/rush-games.js");
// Available page height excludes Safari's address bar and bottom toolbar.
for (const engine of process.argv.includes("--webkit")
  ? [webkit]
  : [chromium]) {
  const browser = await engine.launch();
  try {
    for (const viewport of [
      { width: 390, height: 568 },
      { width: 390, height: 620 },
      { width: 320, height: 568 },
      { width: 1440, height: 900 },
    ]) {
      const page = await browser.newPage({
        viewport,
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
      await page.addInitScript(() => {
        crypto.randomUUID = () => "00000000-0000-4000-8000-000000000031";
      });
      console.log(engine.name(), viewport);
      page.on("pageerror", (error) => console.error(error));
      page.on("requestfailed", (request) =>
        console.error(request.url(), request.failure()),
      );
      await page.bringToFront();
      await page.goto(`${base}/rush/yearrot/`);
      const child = page.frameLocator('iframe[title="yearrot"]');
      await child
        .locator(".rot-slot")
        .first()
        .waitFor()
        .catch(async (error) => {
          console.error(await page.locator("body").innerText());
          await page.screenshot({
            path: `${output}/failure-${engine.name()}-${viewport.width}-${viewport.height}.png`,
          });
          throw error;
        });
      assert.equal(
        await child.locator(".rot-year-event").innerText(),
        "The Curiosity rover lands on Mars",
      );
      const geometry = await child.locator("body").evaluate(() => {
        const choices = [
          ...document.querySelectorAll(".rot-slot, .game-help button"),
        ];
        const clues = [...document.querySelectorAll(".rot-event")];
        return {
          height: innerHeight,
          width: innerWidth,
          choices: choices.map((n) => n.getBoundingClientRect().toJSON()),
          clues: clues.map((n) => n.getBoundingClientRect().toJSON()),
        };
      });
      for (const rect of [...geometry.clues, ...geometry.choices]) {
        assert.ok(
          rect.left >= 0 &&
            rect.right <= geometry.width &&
            rect.top >= 0 &&
            (viewport.width === 320 || rect.bottom <= geometry.height),
          `${engine.name()} ${JSON.stringify(viewport)} hides clue or answer: ${JSON.stringify({ rect, geometry })}`,
        );
      }
      await page.screenshot({
        path: `${output}/${engine.name()}-${viewport.width}-${viewport.height}.png`,
      });
      reports.push({
        engine: engine.name(),
        viewport,
        ...(engine === chromium
          ? await checkPage(page, policy)
          : {
              incomplete:
                "Lintapple computed-style inspection is unsupported in WebKit; geometry and interactions checked directly.",
            }),
      });
      await child
        .getByRole("button", { name: "How to play", exact: true })
        .click();
      await child.locator("dialog[open]").waitFor();
      await child.getByRole("button", { name: "Close", exact: true }).click();
      await child.locator(".rot-slot").last().scrollIntoViewIfNeeded();
      await child.locator(".rot-slot").last().click();
      await child.locator(".rot-feedback").waitFor();
      await page.close();
    }
    // Every game eligible to appear first in mixed Rush must expose its controls.
    for (const game of rushGames) {
      console.log(engine.name(), game.label);
      const page = await browser.newPage({
        viewport: { width: 390, height: 568 },
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      page.on("pageerror", (error) => console.error(error));
      page.on("requestfailed", (request) =>
        console.error(request.url(), request.failure()),
      );
      await page.bringToFront();
      await page.goto(`${base}/rush/${game.label.toLowerCase()}/`);
      const child = page.frameLocator(`iframe[title="${game.label}"]`);
      await child
        .getByRole("button", { name: "How to play", exact: true })
        .waitFor()
        .catch(async (error) => {
          console.error(await page.locator("body").innerText());
          console.error(page.frames().map((frame) => frame.url()));
          throw error;
        });
      await child.locator("#quiz button").first().waitFor();
      const hidden = await child.locator("body").evaluate(() =>
        [...document.querySelectorAll("#quiz button, .game-help button")]
          .filter((n) => n.checkVisibility())
          .filter((n) => {
            const r = n.getBoundingClientRect();
            return (
              r.top < 0 ||
              r.left < 0 ||
              r.right > innerWidth ||
              r.bottom > innerHeight
            );
          })
          .map((n) => n.textContent),
      );
      assert.deepEqual(
        hidden,
        [],
        `${engine.name()} ${game.label}: opening controls clipped`,
      );
      const layout = await child.locator("body").evaluate(() => {
        const image = document.querySelector(".visual-viewport");
        const field = document.querySelector(".split-field");
        return {
          imageFits:
            !image || image.clientWidth >= image.parentElement.clientWidth - 2,
          splitLabelsFit:
            !field ||
            [...field.querySelectorAll(".split-left,.split-right")].every(
              (n) =>
                n.getBoundingClientRect().bottom <=
                field.getBoundingClientRect().bottom,
            ),
        };
      });
      assert.ok(layout.imageFits, "Use the available width for image puzzles");
      assert.ok(layout.splitLabelsFit, "Keep split labels inside the field");
      await page.screenshot({
        path: `${output}/${engine.name()}-${game.label}.png`,
      });
      if (engine === chromium) {
        const frame = await (
          await page.locator(`iframe[title="${game.label}"]`).elementHandle()
        ).contentFrame();
        const report = await checkPage(frame, policy);
        reports.push({ game: game.label, ...report });
        assert.deepEqual(
          report.findings.filter((finding) => finding.status !== "unresolved"),
          [],
          `${game.label}: confirmed UI findings`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
await fs.writeFile(
  `${output}/${process.argv.includes("--webkit") ? "webkit" : "chromium"}-ui.json`,
  JSON.stringify(reports, null, 2),
);
console.log(
  "Opening layout and submission passed; 320px screens also verified with vertical scrolling.",
);
