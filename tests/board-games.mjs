import { ciWidths } from "./ci-parts.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
import { boardGames } from "../dist/games/board-catalog.js";
import { makeBoard } from "../dist/games/board-state.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4186";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const output = "test-results/board-games";
await fs.mkdir(output, { recursive: true });
const reports = [],
  receipts = [];
const safari = process.argv.includes("--webkit");
const browser = await (safari ? webkit : chromium).launch();
const only = process.argv.find((a) => a.startsWith("--game="))?.split("=")[1];
async function solve(page, puzzle) {
  if (puzzle.kind === "sudoku")
    for (let i = 0; i < 36; i++)
      if (!puzzle.initial[i]) {
        const cell = page.locator(`[data-cell="${i}"]`);
        await cell.focus();
        await cell.press(puzzle.solution[i]);
        assert.equal(
          await cell.textContent(),
          puzzle.solution[i],
          `Sudoku cell ${i}`,
        );
      }
  if (puzzle.kind === "groups")
    for (const group of puzzle.groups) {
      for (const word of group.words)
        await page
          .locator(`[data-cell="${puzzle.items.indexOf(word)}"]`)
          .click();
      await page
        .getByRole("button", { name: "Submit group", exact: true })
        .click();
    }
  if (puzzle.kind === "crossword")
    for (let i = 0; i < puzzle.solution.length; i++)
      if (puzzle.solution[i] !== "#")
        await page.locator(`[data-cell="${i}"]`).fill(puzzle.solution[i]);
  if (puzzle.kind === "wordgrid") {
    for (let i = 0; i < 25; i++)
      if (puzzle.solution[i] !== "#") {
        const cell = page.locator(`[data-cell="${i}"]`);
        if ((await cell.getAttribute("data-value")) === puzzle.solution[i])
          continue;
        const cells = await page.locator("[data-cell]").evaluateAll((ns) =>
          ns.map((n) => ({
            i: Number(n.dataset.cell),
            v: n.dataset.value,
            disabled: n.disabled,
          })),
        );
        const other = cells.find(
          (c) => !c.disabled && c.i !== i && c.v === puzzle.solution[i],
        );
        assert.ok(other);
        await cell.click();
        await page.locator(`[data-cell="${other.i}"]`).click();
      }
  }

  if (puzzle.kind === "crowns")
    for (const cell of puzzle.solution)
      await page.locator(`[data-cell="${cell}"]`).click();
  if (puzzle.kind === "path")
    for (const cell of puzzle.solution)
      await page.locator(`[data-cell="${cell}"]`).click();
}
try {
  for (const game of boardGames.filter((g) => !only || g.id === only))
    for (const viewport of policy.viewports.filter((v) =>
      ciWidths([390, 1440]).includes(v.width),
    ))
      for (const colorScheme of ["light", "dark"]) {
        const context = await browser.newContext({
          viewport,
          colorScheme,
          hasTouch: viewport.width === 390,
          permissions: safari ? [] : ["clipboard-read", "clipboard-write"],
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.setDefaultTimeout(10000);
        const day = "2026-11-26";
        await page.clock.setFixedTime(new Date(day + "T17:00:00Z"));
        await page.goto(`${base}/${game.id}/`);
        await page.locator(".puzzle-grid").waitFor();
        assert.equal(
          await page.evaluate(
            () => getComputedStyle(document.documentElement).colorScheme,
          ),
          "dark",
        );
        assert.equal(
          await page
            .locator('meta[name="theme-color"]')
            .getAttribute("content"),
          "#0b1428",
        );
        const inspect = async (state) => {
          reports.push({
            game: game.id,
            viewport,
            colorScheme,
            state,
            ...(await checkPage(page, policy)),
          });
          await page.screenshot({
            path: `${output}/${game.id}-${viewport.width}-${colorScheme}-${state}.png`,
            fullPage: true,
          });
        };
        assert.ok(
          (await page.locator(".puzzle-grid").boundingBox()).width <= 480,
        );
        await inspect("opening");
        await page
          .getByRole("button", { name: "How to play", exact: true })
          .press("Enter");
        await page.getByRole("dialog").waitFor();
        await inspect("help");
        const dialogPaint = await page.getByRole("dialog").evaluate((node) => ({
          foreground: getComputedStyle(node).color,
          background: getComputedStyle(node).backgroundColor,
        }));
        assert.deepEqual(dialogPaint, {
          foreground: "rgb(243, 247, 255)",
          background: "rgb(20, 36, 66)",
        });

        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.activeElement?.id === "help");
        const puzzle = makeBoard(game.id, day);
        if (puzzle.kind === "path") {
          await page.locator(`[data-cell="${puzzle.solution[1]}"]`).click();
          assert.match(
            await page.locator(".puzzle-progress").textContent(),
            /^0 of/,
          );
          await page.locator(`[data-cell="${puzzle.solution[0]}"]`).focus();
          await page.keyboard.press("Enter");
          await page.reload();
          await page.locator(".puzzle-grid").waitFor();
          assert.match(
            await page.locator(".puzzle-progress").textContent(),
            /^1 of/,
          );
          await page.getByRole("button", { name: "Undo", exact: true }).click();
        }
        await solve(page, puzzle);
        await page
          .locator("#puzzle-title")
          .filter({ hasText: "Solved" })
          .waitFor();
        await inspect("solved");
        await page.reload();
        await page
          .locator("#puzzle-title")
          .filter({ hasText: "Solved" })
          .waitFor();
        if (safari)
          await page.evaluate(() =>
            Object.defineProperty(navigator, "clipboard", { value: undefined }),
          );
        await page
          .getByRole("button", { name: "Copy results", exact: true })
          .click();
        if (safari)
          assert.match(
            await page
              .getByRole("textbox", { name: "Results to copy" })
              .inputValue(),
            new RegExp(`dailyo · ${game.name}`),
          );
        else
          assert.match(
            await page.evaluate(() => navigator.clipboard.readText()),
            new RegExp(`dailyo · ${game.name}`),
          );
        await page
          .getByRole("button", { name: "Play practice", exact: true })
          .click();
        await page.locator(".puzzle-grid").waitFor();
        await inspect("practice");
        await page.reload();
        await page.locator(".puzzle-grid").waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Practice", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );

        await page.locator(".puzzle-assistance summary").click();
        await page
          .getByRole("button", { name: "Show answer", exact: true })
          .click();
        await page
          .locator("#puzzle-title")
          .filter({ hasText: "Answer shown" })
          .waitFor();
        await inspect("revealed");
        await page
          .getByRole("button", { name: "New puzzle", exact: true })
          .click();
        await page.locator(".puzzle-grid").waitFor();
        await page.getByRole("button", { name: "Daily", exact: true }).click();
        await page
          .locator("#puzzle-title")
          .filter({ hasText: "Solved" })
          .waitFor();
        await page.clock.setFixedTime(new Date("2026-11-27T17:00:00Z"));
        await page.evaluate(() =>
          document.dispatchEvent(new Event("visibilitychange")),
        );
        await page
          .locator(
            ".puzzle-grid :is(button:not(:disabled),input:not([readonly]))",
          )
          .first()
          .waitFor();
        assert.deepEqual(errors, []);
        receipts.push({
          game: game.id,
          viewport,
          colorScheme,
          checks: [
            "solve",
            "reload",
            "keyboard",
            "help",
            "practice",
            "reveal",
            "share",
            "rollover",
          ],
        });
        await context.close();
      }
} finally {
  await browser.close();
  await fs.writeFile(
    `${output}/receipt${only ? "-" + only : ""}.json`,
    JSON.stringify({ base, receipts, reports }, null, 2),
  );
}
assert.deepEqual(
  reports.flatMap((r) => r.findings.filter((f) => f.status !== "unresolved")),
  [],
);
console.log(
  `${receipts.length} board-game journeys passed, including UI policy.`,
);
