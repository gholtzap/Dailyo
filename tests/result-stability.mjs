import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
import { perceptionPuzzle } from "../dist/games/perception-puzzles.js";
import { shuffle } from "../dist/daily/puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";
import { setAngle } from "./angle-helpers.mjs";
import { individualRushGames } from "../dist/daily/rush-games.js";
import { visualSet, prepareVisual } from "../dist/games/visual-puzzles.js";
import { extraPuzzle, prepareExtra } from "../dist/games/extra-puzzles.js";
import { makeSet, preparePuzzles } from "../dist/games/rot-puzzles.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const out = `test-results/result-stability/${engine.name()}`;
await fs.mkdir(out, { recursive: true });
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const browser = await engine.launch(),
  receipt = [],
  reports = [];
const runId = "00000000-0000-4000-8000-000000000031";
const day = "2026-11-26";
async function settle(page) {
  await page.waitForFunction(() => {
    const f = document.querySelector("iframe[title]:not([hidden])");
    return (
      f &&
      !f.classList.contains("feed-loading") &&
      f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 2
    );
  });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
async function geometry(page, child) {
  const body = await page.locator(".feed-body").boundingBox();
  const footer = await page.locator(".rush-controls").boundingBox();
  const puzzleNodes = child
    .locator(
      ".perception-field,.split-field,.angle-board,.prompt,.visual-viewport,.rot-year-event",
    )
    .first();
  const puzzle = (await puzzleNodes.count())
    ? await puzzleNodes.boundingBox()
    : null;
  const scroll = await page.evaluate(() => scrollY);
  return {
    body: { ...body, y: body.y + scroll },
    footer: { ...footer, y: footer.y + scroll },
    puzzle: puzzle ? { ...puzzle, y: puzzle.y + scroll } : null,
    scroll,
  };
}
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 620 },
    { width: 1440, height: 1000 },
  ]) {
    for (const game of [
      "flagrot",
      "langrot",
      "Vocabulary",
      "trackrot",
      "splitrot",
      "anglerot",
      "pricerot",
      "scalerot",
      "yearrot",
    ]) {
      for (const correct of game === "flagrot" ? [true, false] : [true]) {
        const p = await browser.newPage({
          viewport,
          hasTouch: viewport.width < 600,
          colorScheme: "light",
          reducedMotion: "reduce",
        });
        p.setDefaultTimeout(10000);
        const errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        await p.clock.setFixedTime(new Date(day + "T17:00:00Z"));
        const seconds = individualRushGames.find((g) => g.label === game)
          .seconds[0];
        await p.addInitScript(
          ({ game, seconds, runId, day }) => {
            if (window === parent)
              sessionStorage.setItem(
                "dailyo:rush:run:" + game.toLowerCase(),
                JSON.stringify({
                  date: day,
                  games: game,
                  runId,
                  index: 0,
                  round: 1,
                  remaining: seconds * 1000,
                  scores: [1],
                  streak: 1,
                }),
              );
          },
          { game, seconds, runId, day },
        );
        await p.goto(`${base}/rush/${game.toLowerCase()}/`, {
          waitUntil: "domcontentloaded",
        });
        await p.getByRole("button", { name: "Resume", exact: true }).waitFor();
        await p.getByRole("button", { name: "Resume", exact: true }).click();
        const child = p.frameLocator(`iframe[title="${game}"]`);
        if (game === "trackrot") await child.getByRole("slider").waitFor();
        await settle(p);
        await child.locator("body").evaluate(() => {
          window.resultScrollSamples = [scrollY];
          addEventListener("scroll", () =>
            window.resultScrollSamples.push(scrollY),
          );
        });
        const before = await geometry(p, child);
        await p.screenshot({
          path: `${out}/${viewport.width}-${game}-${correct}-playing.png`,
          fullPage: true,
        });
        if (["flagrot", "langrot", "Vocabulary"].includes(game)) {
          const kind =
            game === "flagrot"
              ? "flags"
              : game === "langrot"
                ? "languages"
                : "vocabulary";
          const rows = JSON.parse(
            await fs.readFile(`dist/games/data/${kind}.json`, "utf8"),
          );
          const target = shuffle(rows, `rush:${kind}:${day}:${runId}`)[1];
          const buttons = child.locator(".choice");
          if (correct)
            await child
              .getByRole("button", { name: target.name, exact: true })
              .click();
          else
            await buttons.filter({ hasNotText: target.name }).first().click();
        } else if (
          game === "pricerot" ||
          game === "scalerot" ||
          game === "yearrot"
        ) {
          const raw = JSON.parse(
            await fs.readFile(`dist/games/data/${game}.json`, "utf8"),
          );
          const seed = await rushSeed(p, game);
          if (game === "pricerot") {
            const q = visualSet(game, prepareVisual(game, raw), seed)[1];
            await child
              .getByLabel("Your guess")
              .fill(String(q.item.cents / 100));
            await child
              .getByRole("button", { name: "Check price", exact: true })
              .click();
          } else if (game === "scalerot") {
            const q = extraPuzzle(game, prepareExtra(game, raw), `${seed}:1`);
            await child.getByRole("spinbutton").fill(String(q.actual));
            await child
              .getByRole("button", { name: "Check estimate", exact: true })
              .click();
          } else {
            const q = makeSet(game, preparePuzzles(game, raw), seed)[1];
            await child
              .locator(".rot-slot")
              .nth(q.timeline.filter(([year]) => year < q.event[0]).length)
              .click();
          }
        } else {
          const q = perceptionPuzzle(game, await rushSeed(p, game), 1);
          if (game === "anglerot") {
            await setAngle(child, q.target);
            await child
              .getByRole("button", { name: "Check angle", exact: true })
              .click();
          } else {
            await child
              .getByRole("slider")
              .fill(
                String(
                  Number(
                    (game === "trackrot"
                      ? q.target * 100
                      : (q.right ? 1 - q.target : q.target) * 100
                    ).toFixed(1),
                  ),
                ),
              );
            await child
              .getByRole("button", {
                name: game === "trackrot" ? "Check landing" : "Check split",
                exact: true,
              })
              .click();
          }
        }
        await p
          .locator("#rush-status")
          .filter({ hasText: correct ? "Correct" : "Missed" })
          .waitFor();
        // Hold feedback with a native pointer without scrolling the footer into view.
        await p.mouse.move(4, 100);
        await p.mouse.down();
        await settle(p);
        const after = await geometry(p, child);
        await p.screenshot({
          path: `${out}/${viewport.width}-${game}-${correct}-feedback.png`,
          fullPage: true,
        });
        const internalScroll = await child
          .locator("body")
          .evaluate(() => window.resultScrollSamples);
        assert.ok(
          internalScroll.every((y) => y === 0),
          `${game}: feedback focus must not scroll the embedded frame`,
        );
        assert.ok(
          Math.abs(before.body.y - after.body.y) <= 1,
          `${game}: result must not move the puzzle card (${before.body.y} -> ${after.body.y})`,
        );
        if (before.puzzle && after.puzzle)
          assert.ok(
            Math.abs(before.puzzle.y - after.puzzle.y) <= 1,
            `${game}: keep the comparison in the same place`,
          );
        assert.ok(
          after.footer.y >= before.footer.y - 1,
          `${game}: replacing controls must not pull Next upward`,
        );
        assert.equal(
          await p.locator(".rush-time").isVisible(),
          true,
          "The stopped timer retains the header row",
        );
        await p.mouse.up();
        if (correct) {
          await p.getByRole("button", { name: "Next", exact: true }).click();
          await p
            .locator("#rush-round")
            .filter({ hasText: "Round 3" })
            .waitFor();
          await settle(p);
          assert.ok(
            Math.abs(
              (await p.locator(".feed-body").boundingBox()).y - before.body.y,
            ) <= 1,
            `${game}: next round returns to the same anchor`,
          );
        }
        if (engine === chromium) {
          reports.push({
            game,
            viewport,
            correct,
            ...(await checkPage(p, policy)),
          });
        }
        assert.deepEqual(errors, []);
        receipt.push({ game, viewport, correct, before, after });
        console.log(engine.name(), viewport.width, game, correct, "stable");
        await p.close();
      }
    }
    if (viewport.width === 390) {
      // Real wall-clock playback verifies that the result is readable on a phone.
      const p = await browser.newPage({ viewport, colorScheme: "dark" });
      p.setDefaultTimeout(10000);
      await p.clock.setFixedTime(new Date(day + "T17:00:00Z"));
      await p.goto(`${base}/rush/trackrot/`, { waitUntil: "domcontentloaded" });
      const child = p.frameLocator("iframe[title=trackrot]");
      await child.getByRole("slider").waitFor();
      const seed = await rushSeed(p, "trackrot");
      async function submit(round) {
        const q = perceptionPuzzle("trackrot", seed, round);
        await child
          .getByRole("slider")
          .fill(String(Number((q.target * 100).toFixed(1))));
        await child
          .getByRole("button", { name: "Check landing", exact: true })
          .click();
        await child
          .locator("#perception-feedback")
          .filter({ hasText: "Correct" })
          .waitFor();
      }
      await submit(0);
      const began = performance.now();
      await p.waitForTimeout(2700);
      assert.equal(
        await p.locator("#rush-round").textContent(),
        "Round 1",
        "Landing feedback remains readable for almost three seconds",
      );
      await p.locator("#rush-round").filter({ hasText: "Round 2" }).waitFor();
      assert.ok(
        performance.now() - began < 4000,
        "Automatic progression still works after the reading window",
      );
      await child.getByRole("slider").waitFor();
      await submit(1);
      const keep = p.getByRole("button", { name: "Keep answer", exact: true });
      await keep.click();
      assert.equal(
        await keep.isVisible(),
        false,
        "Keep answer must receive the click, including in WebKit",
      );
      await p.waitForTimeout(3500);
      assert.equal(await p.locator("#rush-round").textContent(), "Round 2");
      await p.getByRole("button", { name: "Next", exact: true }).click();
      await p.locator("#rush-round").filter({ hasText: "Round 3" }).waitFor();
      console.log(
        engine.name(),
        "Track: real three-second result, Keep answer, immediate Next passed",
      );
      await p.close();
    }
  }
} finally {
  await browser.close();
}
await fs.writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2));
await fs.writeFile(`${out}/ui.json`, JSON.stringify(reports, null, 2));
assert.deepEqual(
  reports.flatMap((r) => r.findings.filter((f) => f.status !== "unresolved")),
  [],
);
