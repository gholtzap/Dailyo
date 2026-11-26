import { setAngle } from "./angle-helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import {
  perceptionGames,
  perceptionPuzzle,
} from "../dist/games/perception-puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const browser = await chromium.launch(),
  receipts = [],
  reports = [];
await fs.mkdir("test-results/rush-improvements", { recursive: true });
try {
  for (const width of [390, 1440])
    for (const game of perceptionGames) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        colorScheme: "dark",
      });
      await page.addInitScript(() => {
        if (window === parent) {
          window.rushTestAudio = [];
          const NativeAudio = AudioContext;
          window.AudioContext = class extends NativeAudio {
            constructor(...args) {
              super(...args);
              window.rushTestAudio.push(this);
            }
          };
        }
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const time = new Date("2026-11-21T17:00:00Z");
      await page.clock.install({ time });
      await page.clock.pauseAt(new Date(+time + 1000));
      await page.goto(`${base}/rush/${game}/`);
      await page
        .locator("#rush-status")
        .filter({ hasText: "Round 1" })
        .waitFor();
      const seed = await rushSeed(page, game),
        staticGame = game === "anglerot" || game === "splitrot";
      const child = () => page.frameLocator(`iframe[title="${game}"]`);
      let soundGestures = 0;
      for (let round = 0; round < 2; round++) {
        const q = perceptionPuzzle(game, seed, round);
        const manual = round === 0 && !staticGame;
        if (manual)
          await child()
            .getByRole("button", { name: "Start round", exact: true })
            .click();
        else {
          assert.equal(
            await child()
              .getByRole("button", { name: "Start round", exact: true })
              .count(),
            0,
          );
          if (!staticGame) {
            await page
              .getByRole("button", { name: "Pause", exact: true })
              .click();
            await child()
              .locator("html[data-rush-paused]")
              .waitFor({ state: "attached" });
            await page.clock.runFor(1);
            await page.clock.runFor(5000);
            assert.equal(
              await child().locator("canvas, #tap, #dot-count").count(),
              0,
              `${game}: Pause freezes the queued ready cue`,
            );
            await page
              .getByRole("button", { name: "Resume", exact: true })
              .click();
            for (
              let step = 0;
              step < 100 &&
              (await child().getByText("Starting…", { exact: true }).count());
              step++
            )
              await page.clock.runFor(20);
          }
        }
        if (game === "countrot" || game === "trackrot")
          await page.clock.runFor(1400);
        if (game === "countrot") {
          await child().getByRole("spinbutton").fill(String(q.target));
          await child().getByRole("button", { name: "Check estimate" }).click();
        }
        if (game === "trackrot") {
          await child()
            .getByRole("slider")
            .fill(String(Number((q.target * 100).toFixed(1))));
          await child().getByRole("button", { name: "Check landing" }).click();
        }
        if (game === "anglerot") {
          await setAngle(child(), q.target);
          await child().getByRole("button", { name: "Check angle" }).click();
        }
        if (game === "splitrot") {
          await child()
            .getByRole("slider")
            .fill(
              String(
                Number(((q.right ? 1 - q.target : q.target) * 100).toFixed(1)),
              ),
            );
          await child().getByRole("button", { name: "Check split" }).click();
        }
        if (game === "temporot") {
          const enable = child().getByRole("button", { name: "Enable sound" });
          const listening = child().getByText(
            "Listen to the four reference beats…",
            { exact: true },
          );
          await listening.or(enable).first().waitFor();
          if (await enable.isVisible()) {
            await enable.click();
            soundGestures++;
          }
          await listening.waitFor();
          for (
            let step = 0;
            step < 400 &&
            !(await child()
              .getByRole("button", { name: "Tap", exact: true })
              .count());
            step++
          )
            await page.clock.runFor(10);
          await child()
            .getByRole("button", { name: "Tap", exact: true })
            .waitFor();
          await page.clock.runFor(q.interval - 100);
          for (let i = 0; i < 8; i++) {
            if (i) await page.clock.runFor(q.interval);
            await child()
              .getByRole("button", { name: "Tap", exact: true })
              .press("Space");
          }
        }
        await page
          .locator("#rush-status")
          .filter({ hasText: "Correct" })
          .waitFor();
        await page
          .getByRole("button", { name: "Keep answer", exact: true })
          .click();
        const preload = page.frameLocator(`iframe[src*="rush=${round + 1}&"]`);
        await preload
          .getByRole("heading", {
            name:
              game === "countrot"
                ? "How many dots?"
                : game === "trackrot"
                  ? "Where will it land?"
                  : game === "anglerot"
                    ? "Set the angle"
                    : game === "splitrot"
                      ? "Split the line"
                      : "Keep the beat",
            exact: true,
          })
          .waitFor({ state: "attached" });
        assert.equal(
          await preload.locator("canvas, input, #tap").count(),
          0,
          "Preloaded puzzles must not play or create answer controls",
        );
        if (round === 1) {
          await page.clock.resume();
          reports.push({ width, game, ...(await checkPage(page, policy)) });
          await page.screenshot({
            path: `test-results/rush-improvements/autostart-${game}-${width}.png`,
          });
          await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
        } else {
          await page.getByRole("button", { name: "Next", exact: true }).click();
          await page
            .locator("#rush-status")
            .filter({ hasText: "Round 2" })
            .waitFor();
        }
      }
      if (game === "temporot") {
        assert.equal(
          soundGestures,
          0,
          "The first rhythm gesture also enables later rounds",
        );
        assert.equal(
          await page.evaluate(() => window.rushTestAudio.length),
          1,
          "Rhythm rounds reuse their host-owned sound context",
        );
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page
          .locator("#rush-status")
          .filter({ hasText: "Round 3" })
          .waitFor();
        await page
          .getByRole("button", { name: "Skip game", exact: true })
          .click();
        await page.getByRole("heading", { name: "Rush recap" }).waitFor();
        await page.clock.resume();
        await page.waitForFunction(() =>
          window.rushTestAudio.every((context) => context.state === "closed"),
        );
      }
      assert.deepEqual(errors, []);
      receipts.push({
        width,
        game,
        correct: 2,
        soundGestures,
        preload: "inactive",
        cue: "paused and resumed",
      });
      await page.close();
      console.log(
        `${width}px ${game}: automatic second round, paused cue, idle preload, ${soundGestures} audio gestures`,
      );
    }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/rush-improvements/autostart.json",
    JSON.stringify({ receipts, reports }, null, 2),
  );
}
assert.deepEqual(
  reports.flatMap((r) => r.findings),
  [],
);
console.log(
  "Rush auto-start: two real answers per perception game, inactive preloads, queued pause/resume, sound and UI policy at 390px and 1440px",
);
