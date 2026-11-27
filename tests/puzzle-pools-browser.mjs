import { ciWidths, ciGames } from "./ci-parts.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { visualSet } from "../dist/games/visual-puzzles.js";
import { extraPuzzle, prepareExtra } from "../dist/games/extra-puzzles.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const read = async (name) =>
  JSON.parse(
    await fs.readFile(
      new URL(`../dist/games/data/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const policy = JSON.parse(
  await fs.readFile(new URL("../ui-policy.json", import.meta.url), "utf8"),
);
const onlyDifficulty = process.argv
  .find((arg) => arg.startsWith("--ci-difficulty="))
  ?.split("=")[1];
assert.ok(!onlyDifficulty || ["standard", "hard"].includes(onlyDifficulty));
const ui = process.argv.includes("--ui"),
  reports = [],
  checks = [],
  errors = [];
const out = new URL("../test-results/puzzle-pools/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
let currentPage;
try {
  for (const viewport of policy.viewports.filter((v) =>
    ciWidths(policy.viewports.map((v) => v.width)).includes(v.width),
  )) {
    const context = await browser.newContext({
      viewport,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    await context.route("**/api/daily-score", (r) =>
      r.fulfill({ status: 404 }),
    );
    const page = await context.newPage();
    currentPage = page;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date("2026-11-19T16:00:00Z"));
    await page.goto(base);
    for (const game of ciGames(["skyrot", "skylinerot", "zoomrot"])) {
      const rows = await read(game),
        old = game === "zoomrot" ? 11 : 12,
        seeds = new Map();
      for (let i = 0; seeds.size < rows.length && i < 10000; i++) {
        const seed = `practice:expanded-${i}`,
          q = visualSet(game, rows, seed)[0];
        if (!seeds.has(q.item.id)) seeds.set(q.item.id, seed);
      }
      for (const difficulty of ["standard", "hard"].filter(
        (value) => !onlyDifficulty || value === onlyDifficulty,
      ))
        for (const row of rows.filter(
          (row, index) => index >= old || row.image.endsWith(".webp"),
        )) {
          const seed = seeds.get(row.id);
          assert.ok(seed);
          await page.evaluate(
            ({ game, seed, difficulty }) => {
              localStorage.setItem(
                `dailyo:${game}:v1:mode`,
                JSON.stringify("practice"),
              );
              localStorage.setItem(
                `dailyo:${game}:v1:difficulty`,
                JSON.stringify(difficulty),
              );
              localStorage.setItem(
                `dailyo:${game}:v1:practice${difficulty === "standard" ? "" : ":" + difficulty}`,
                JSON.stringify({ seed }),
              );
            },
            { game, seed, difficulty },
          );
          await page.goto(`${base}/${game}/?practice=1`);
          await page.locator("#question-title").waitFor();
          const image = page.locator(".visual-viewport img");
          await image.evaluate((i) => i.decode());
          assert.equal(await image.getAttribute("src"), row.image);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
          assert.equal(await page.locator(".visual-choice").count(), 4);
          if (row === rows[old] || row.image.endsWith(".webp")) {
            if (ui)
              reports.push({
                game,
                difficulty,
                width: viewport.width,
                state: "question",
                ...(await checkPage(page, policy)),
              });
            await page.screenshot({
              path: new URL(
                `${game}-${row.id}-${difficulty}-${viewport.width}.png`,
                out,
              ).pathname,
              fullPage: true,
            });
          }
          await page
            .getByRole("button", { name: row.name, exact: true })
            .click();
          await page
            .locator("#visual-feedback")
            .filter({ hasText: "100 / 100 points" })
            .waitFor();
          await image.evaluate((i) => i.decode());
          assert.equal(await image.getAttribute("alt"), row.name);
          await page.locator(".visual-source summary").click();
          assert.equal(
            await page.locator(".visual-source a").first().getAttribute("href"),
            row.source,
          );
          if ((row === rows[old] || row.image.endsWith(".webp")) && ui)
            reports.push({
              game,
              difficulty,
              width: viewport.width,
              state: "answer and source",
              ...(await checkPage(page, policy)),
            });
          checks.push({
            game,
            id: row.id,
            difficulty,
            width: viewport.width,
            passed: true,
          });
        }
      // A complete expanded Daily set exercises future selection, scoring and saved recap.
      await page.evaluate((game) => {
        localStorage.setItem(`dailyo:${game}:v1:mode`, JSON.stringify("daily"));
      }, game);
      await page.goto(`${base}/${game}/`);
      await page.locator("#question-title").waitFor();
      for (const [i, q] of visualSet(game, rows, "2026-11-19").entries()) {
        await page
          .getByRole("button", { name: q.item.name, exact: true })
          .click();
        await page
          .locator("#visual-feedback")
          .filter({ hasText: "100 / 100 points" })
          .waitFor();
        await page
          .getByRole("button", {
            name: i === 4 ? "See results" : "Next",
            exact: true,
          })
          .click();
      }
      await page
        .getByRole("heading", { name: "500 / 500 points", exact: true })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", { name: "500 / 500 points", exact: true })
        .waitFor();
    }
    console.log(
      `${viewport.width}px: all expanded photo subjects, scoring and saved recaps passed.`,
    );
    if (
      ciGames(["skyrot", "skylinerot", "zoomrot"]).includes("skyrot") &&
      (!onlyDifficulty || onlyDifficulty === "standard")
    ) {
      const ladders = await read("ladderrot"),
        data = prepareExtra("ladderrot", ladders, await read("ladder-words"));
      for (const index of [29, 128, 129, 500, 999]) {
        const token = `practice:deck:${index}:expanded-check`,
          puzzle = extraPuzzle("ladderrot", data, token);
        await page.evaluate(
          (token) =>
            localStorage.setItem(
              "dailyo:ladderrot:v1:practice",
              JSON.stringify({ token, puzzle: "", moves: [] }),
            ),
          token,
        );
        await page.goto(`${base}/ladderrot/?practice=1`);
        await page.locator("#extra-title").waitFor();
        assert.equal(
          (await page.locator("#extra-title").innerText()).toLowerCase(),
          `${puzzle.start} to ${puzzle.goal}`,
        );
        for (const word of puzzle.solution.slice(1)) {
          await page.getByLabel("Next word").fill(word);
          await page
            .getByRole("button", { name: "Add word", exact: true })
            .click();
        }
        await page
          .getByRole("button", { name: "New puzzle", exact: true })
          .waitFor();
        checks.push({
          game: "ladderrot",
          id: puzzle.id,
          width: viewport.width,
          passed: true,
        });
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({
      path: new URL("failure.png", out).pathname,
      fullPage: true,
    });
    await fs.writeFile(
      new URL("failure.json", out),
      JSON.stringify(
        {
          url: currentPage.url(),
          text: await currentPage.locator("body").innerText(),
          storage: await currentPage
            .evaluate(() => ({ ...localStorage }))
            .catch(() => null),
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
  await fs.writeFile(
    new URL("browser.json", out),
    JSON.stringify({ base, checks, errors }, null, 2),
  );
  if (ui)
    await fs.writeFile(
      new URL("ui.json", out),
      JSON.stringify(reports, null, 2),
    );
}
console.log(
  `${checks.length} expanded-photo and ladder browser checks passed.`,
);
if (
  ui &&
  reports.some(
    (r) => r.violations?.length || r.issues?.length || r.findings?.length,
  )
)
  process.exitCode = 1;
