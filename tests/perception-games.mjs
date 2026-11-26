import { setAngle, drawAngle } from "./angle-helpers.mjs";
import { ciWidths, ciShared } from "./ci-parts.mjs";
import { rushSeed } from "./rush-helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import {
  perceptionGames,
  perceptionPuzzle,
} from "../dist/games/perception-puzzles.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173",
  day = "2026-11-19";
const lint = process.argv.includes("--ui");
const policy = JSON.parse(
  await fs.readFile(new URL("../ui-policy.json", import.meta.url)),
);
const browser = await chromium.launch(),
  reports = [],
  receipt = [];
const errors = [];
await fs.mkdir("test-results/perception", { recursive: true });
async function setRange(page, value) {
  await page
    .locator("input[type=range]")
    .fill(String(Number(value.toFixed(1))));
}
async function solve(page, game, q) {
  if (game === "temporot")
    await page.clock.pauseAt(
      await page.evaluate(() => new Date(Date.now() + 1000).toISOString()),
    );
  const start = page.getByRole("button", { name: "Start round", exact: true });
  if (await start.count()) await start.press("Enter");
  else
    assert.ok(
      game === "trackrot" ||
        game === "anglerot" ||
        (game === "splitrot" &&
          (new URL(page.url()).searchParams.has("rush") ||
            (await page
              .getByRole("button", {
                name: "Practice",
                pressed: true,
                exact: true,
              })
              .count()))),
    );
  if (game === "trackrot" && (await page.locator(".track-countdown").count()))
    await page.clock.runFor(3000);
  if (game === "countrot" || game === "trackrot") await page.clock.runFor(1400);
  if (game === "countrot") {
    await page.getByLabel("How many dots?").fill(String(q.target));
    await page
      .getByRole("button", { name: "Check estimate", exact: true })
      .click();
  }
  if (game === "trackrot") {
    await setRange(page, q.target * 100);
    await page
      .getByRole("button", { name: "Check landing", exact: true })
      .click();
  }
  if (game === "anglerot") {
    await setAngle(page, q.target);
    await page
      .getByRole("button", { name: "Check angle", exact: true })
      .click();
  }
  if (game === "splitrot") {
    await setRange(page, (q.right ? 1 - q.target : q.target) * 100);
    await page
      .getByRole("button", { name: "Check split", exact: true })
      .click();
  }
  if (game === "temporot") {
    // Audio starts 150 ms after the user gesture; clock steps exercise the real tap path.
    await page
      .getByText("Listen to the four reference beats…", { exact: true })
      .waitFor();
    await page.clock.runFor(150 + (q.hard ? 3.5 : 4) * q.interval);
    for (let i = 0; i < 8; i++) {
      if (i) await page.clock.runFor(q.interval);
      await page
        .getByRole("button", { name: "Tap", exact: true })
        .press("Space");
    }
  }
  await page.locator("#perception-feedback").waitFor();
  if (game === "temporot") await page.clock.resume();
  const points = Number(
    (await page.locator(".perception-feedback").textContent()).match(
      /(\d+) \/ 100/,
    )[1],
  );
  assert.ok(
    points >= (game === "temporot" ? 98 : 100),
    `${game}: expected accurate input, received ${points}`,
  );
  return points;
}
try {
  for (const width of ciWidths([390, 1440])) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      colorScheme: "dark",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date(`${day}T16:00:00Z`) });
    const inspect = async (game, state) => {
      if (lint) {
        const report = await checkPage(page, policy);
        reports.push({ game, width, state, ...report });
      }
      assert.ok(
        await page.locator("body").evaluate((n) => n.scrollWidth <= innerWidth),
        "horizontal overflow",
      );
    };
    for (const game of perceptionGames) {
      await page.goto(`${base}/${game}/`);
      if (game === "trackrot") await page.locator(".track-countdown").waitFor();
      else
        await page
          .getByRole(game === "anglerot" ? "slider" : "button", {
            name: game === "anglerot" ? "Draw angle" : "Start round",
          })
          .waitFor();
      await inspect(game, "ready");
      if (game === "anglerot") {
        const board = page.getByRole("slider", { name: "Draw angle" });
        const check = page.getByRole("button", {
          name: "Check angle",
          exact: true,
        });
        assert.equal(await check.isDisabled(), true);
        const box = await board.boundingBox();
        // A tap away from the center cannot create an answer.
        await page.mouse.click(
          box.x + box.width * 0.8,
          box.y + box.height * 0.3,
        );
        assert.equal(await check.isDisabled(), true);
        await drawAngle(page, page, 42.5);
        assert.ok(
          Math.abs(Number(await board.getAttribute("aria-valuenow")) - 42.5) <
            0.1,
        );
        await page.reload();
        assert.ok(
          Math.abs(Number(await board.getAttribute("aria-valuenow")) - 42.5) <
            0.1,
        );
        // An interrupted redraw keeps the committed ray.
        const restored = await board.boundingBox();
        await page.mouse.move(
          restored.x + restored.width / 2,
          restored.y + restored.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          restored.x + restored.width * 0.7,
          restored.y + restored.height * 0.7,
        );
        await board.dispatchEvent("pointercancel");
        await page.mouse.up();
        assert.ok(
          Math.abs(Number(await board.getAttribute("aria-valuenow")) - 42.5) <
            0.1,
        );
        await page.getByRole("button", { name: "Clear", exact: true }).click();
        assert.equal(await check.isDisabled(), true);
        assert.equal(await board.getAttribute("aria-valuetext"), "Not drawn");
        await drawAngle(page, page, 127);
        assert.equal(await check.isEnabled(), true);
      }

      await page
        .getByRole("button", { name: "How to play", exact: true })
        .click();
      await inspect(game, "help");
      await page.getByRole("button", { name: "Close", exact: true }).click();
      let total = 0;
      for (let i = 0; i < 5; i++) {
        total += await solve(page, game, perceptionPuzzle(game, day, i));
        if (i === 0) {
          await inspect(game, "feedback");
          await page.reload();
        } else
          await page
            .getByRole("button", {
              name: i === 4 ? "See results" : "Next",
              exact: true,
            })
            .click();
      }
      await page
        .getByRole("heading", { name: `${total} / 500 points`, exact: true })
        .waitFor();
      await inspect(game, "results");
      await page
        .getByRole("button", { name: "Copy results", exact: true })
        .click();
      assert.match(
        await page.evaluate(() => navigator.clipboard.readText()),
        new RegExp(`${game} ${day}`),
      );
      await page.reload();
      await page
        .getByRole("heading", { name: `${total} / 500 points`, exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Play practice", exact: true })
        .click();
      await page.getByLabel("Practice variation").selectOption("hard");
      await inspect(game, "hard-ready");
      const seed = await page.evaluate(
        (game) =>
          JSON.parse(
            localStorage.getItem(`dailyo:${game}:v1:practice:hard`) ?? "null",
          )?.seed,
        game,
      );
      // Starting fresh practice saves its seed before the first round for repeatable replay.
      if (game === "trackrot" || game === "anglerot" || game === "splitrot")
        assert.equal(
          await page
            .getByRole("button", { name: "Start round", exact: true })
            .count(),
          0,
        );
      else
        await page
          .getByRole("button", { name: "Start round", exact: true })
          .click();
      if (game === "trackrot") await page.clock.runFor(3000);
      if (game === "countrot" || game === "trackrot")
        await page.clock.runFor(1400);
      if (game === "temporot") await page.clock.runFor(3000);
      await inspect(game, "hard-answer");
      if (game === "anglerot") {
        await page.getByRole("slider", { name: "Draw angle" }).focus();
        await page.keyboard.press("ArrowRight");
        assert.ok(
          Number(
            await page
              .getByRole("slider", { name: "Draw angle" })
              .getAttribute("aria-valuenow"),
          ) > 0,
        );
      }
      await page.screenshot({
        path: `test-results/perception/${game}-${width}.png`,
      });
      await page
        .getByRole("button", { name: "Skip round", exact: true })
        .click();
      await inspect(game, "skipped");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await solve(page, game, perceptionPuzzle(game, seed, 1, true));
      await page.getByRole("button", { name: "Daily", exact: true }).click();
      await page
        .getByRole("heading", { name: `${total} / 500 points`, exact: true })
        .waitFor();
      receipt.push(
        `${width}px ${game}: five accurate rounds, reload/resume, sharing, hard practice, skip, daily preservation`,
      );
    }
    // Real daily host consumes the completed sets and includes all five in its recap.
    await page.goto(`${base}/daily/`);
    for (let i = 0; i < 16; i++) {
      await page
        .getByRole("button", { name: "Skip game", exact: true })
        .click();
    }
    await page
      .getByRole("heading", { name: "Daily recap", exact: true })
      .waitFor();
    assert.equal(await page.locator("#feed-results li").count(), 21);
    for (const game of perceptionGames)
      assert.match(
        await page
          .locator("#feed-results li")
          .filter({ hasText: game })
          .innerText(),
        /\d+ \/ 500 points/,
      );
    await context.close();
  }
  if (ciShared()) {
    // Exercise actual canvas paints and the stimulus deadline with a controlled clock.
    for (const width of [390, 1440]) {
      for (const { game, hard, reducedMotion, animated } of [
        {
          game: "countrot",
          hard: false,
          reducedMotion: "no-preference",
          animated: false,
        },
        {
          game: "countrot",
          hard: true,
          reducedMotion: "reduce",
          animated: false,
        },
        {
          game: "countrot",
          hard: true,
          reducedMotion: "no-preference",
          animated: true,
        },
        {
          game: "trackrot",
          hard: false,
          reducedMotion: "no-preference",
          animated: true,
        },
      ]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          reducedMotion,
          colorScheme: "dark",
        });
        await context.addInitScript(() => {
          window.canvasPaints = 0;
          const clear = CanvasRenderingContext2D.prototype.clearRect;
          CanvasRenderingContext2D.prototype.clearRect = function (...args) {
            if (this.canvas.classList.contains("perception-field"))
              window.canvasPaints++;
            return clear.apply(this, args);
          };
        });
        const page = await context.newPage();
        await page.clock.install({ time: new Date(`${day}T16:00:00Z`) });
        await page.clock.pauseAt(new Date(`${day}T16:00:01Z`));
        await page.goto(`${base}/${game}/?practice=1`);
        if (hard)
          await page.getByLabel("Practice variation").selectOption("hard");
        if (game === "trackrot") {
          await page.locator(".track-countdown").waitFor();
          await page.clock.runFor(3000);
        } else
          await page
            .getByRole("button", { name: "Start round", exact: true })
            .click();
        const canvas = page.locator("canvas");
        const initial = await canvas.evaluate((canvas) => canvas.toDataURL());
        await page.clock.runFor(500);
        const later = await canvas.evaluate((canvas) => canvas.toDataURL());
        const paints = await page.evaluate(() => window.canvasPaints);
        if (animated) {
          assert.ok(paints > 1, `${game}: moving stimuli must keep animating`);
          assert.notEqual(later, initial);
        } else {
          assert.equal(paints, 1, "Stationary dots must paint exactly once");
          assert.equal(later, initial);
        }
        const duration = game === "countrot" ? 1100 : 1300;
        const answer = page.locator(
          game === "countrot" ? "#dot-count" : "input[type=range]",
        );
        await page.clock.runFor(duration - 501);
        if (!animated)
          assert.equal(
            await page.evaluate(() => window.canvasPaints),
            1,
            "Stationary dots must not repaint before the display deadline",
          );
        assert.equal(
          await answer.count(),
          0,
          "The stimulus must keep its full display interval",
        );
        await page.clock.runFor(1);
        await answer.waitFor();
        if (game === "countrot") assert.equal(await canvas.count(), 0);
        receipt.push(
          `${width}px ${game} ${hard ? "hard" : "standard"} ${reducedMotion}: ${paints} paints at 500ms; ${duration}ms deadline preserved`,
        );
        await context.close();
      }
    }
    // Rush readiness, correct answer, and timeout travel through the parent iframe contract.
    const page = await browser.newPage();
    await page.clock.install({ time: new Date(`${day}T16:00:00Z`) });
    for (const game of perceptionGames) {
      await page.goto(`${base}/rush/${game}/?date=${day}`);
      await page
        .locator("#rush-status")
        .filter({ hasText: "Round 1" })
        .waitFor();
      const frame = page
        .frames()
        .find((f) => f.url().includes(`/${game}/?rush=0`));
      const q = perceptionPuzzle(game, await rushSeed(page, game), 0);
      // Use the page's clock for the frame's actual timers.
      frame.clock = page.clock;
      await solve(frame, game, q);
      await page
        .locator("#rush-status")
        .filter({ hasText: "Round 2" })
        .waitFor();
      const second = page
        .frames()
        .find((f) => f.url().includes(`/${game}/?rush=1`));
      assert.equal(
        await second
          .getByRole("button", { name: "Start round", exact: true })
          .count(),
        0,
        "Later Rush rounds start automatically",
      );
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.clock.runFor(30000);
      assert.equal(
        await second.locator("#perception-feedback").count(),
        0,
        "Paused playback must not score or time out",
      );
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      if (game === "trackrot") {
        await page.clock.runFor(4500);
        const nextPuzzle = perceptionPuzzle(
          game,
          await rushSeed(page, game),
          1,
        );
        await second
          .getByRole("slider")
          .fill(nextPuzzle.target < 0.5 ? "100" : "0");
      }
      await page.clock.runFor(30000);
      await page
        .getByRole("heading", { name: "Rush recap", exact: true })
        .waitFor();
      receipt.push(
        `${game}: Rush ready, correct, pause/resume, timeout, recap`,
      );
    }
    assert.deepEqual(errors, []);
  }
} finally {
  if (lint)
    await fs.writeFile(
      "test-results/perception/ui.json",
      JSON.stringify(reports, null, 2),
    );
  await fs.writeFile(
    "test-results/perception/receipt.txt",
    receipt.join("\n") + "\n",
  );
  await browser.close();
}
console.log(receipt.join("\n"));
const findings = reports.flatMap((r) =>
  r.findings.map((f) => ({
    game: r.game,
    width: r.width,
    state: r.state,
    ...f,
  })),
);
if (findings.length) {
  console.log(JSON.stringify(findings, null, 2));
  process.exitCode = 1;
}
