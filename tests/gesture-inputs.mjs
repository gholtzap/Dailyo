import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
import { setPrice } from "./input-helpers.mjs";
import { makeBoard } from "../dist/games/board-state.js";
import { extraPuzzle, prepareExtra } from "../dist/games/extra-puzzles.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4189";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const out = "test-results/gesture-inputs";
await fs.mkdir(out, { recursive: true });
const reports = [],
  receipts = [];
const day = "2026-11-28";
const browser = await (
  process.argv.includes("--webkit") ? webkit : chromium
).launch();
try {
  for (const viewport of policy.viewports)
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        hasTouch: viewport.width === 390,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.setFixedTime(new Date(day + "T17:00:00Z"));
      await context.route("**/api/daily-score", (route) =>
        route.fulfill({ status: 404 }),
      );
      const inspect = async (name) => {
        reports.push({
          name,
          viewport,
          colorScheme,
          ...(process.argv.includes("--webkit")
            ? {
                uiAudit:
                  "Not run: installed Lintapple requires CSS properties unavailable in WebKit.",
              }
            : await checkPage(page, policy)),
        });
        await page.screenshot({
          path: `${out}/${name}-${viewport.width}-${colorScheme}.png`,
          fullPage: true,
        });
      };
      await page.goto(`${base}/pricerot/`);
      const dollars = page.getByRole("slider", {
        name: "Dollars",
        exact: true,
      });
      await dollars.waitFor();
      assert.equal(
        await page.locator("input[type=number],input[type=text]").count(),
        0,
      );
      await inspect("price-opening");
      await dollars.focus();
      await dollars.press("ArrowRight");
      const cents = page.getByRole("slider", { name: "Cents", exact: true });
      await cents.focus();
      await cents.press("ArrowRight");
      assert.equal(await page.locator("#price-value").textContent(), "$1.01");
      const box = await dollars.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 60);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 24, { steps: 4 });
      await page.mouse.up();
      assert.equal(await dollars.inputValue(), "3");
      for (const [amount, expected] of [
        [0, "$0.00"],
        [0.01, "$0.01"],
        [19.99, "$19.99"],
        [123.45, "$123.45"],
        [10000, "$10,000.00"],
      ]) {
        await setPrice(page, amount);
        assert.equal(
          await page.locator("#price-value").textContent(),
          expected,
        );
      }
      await setPrice(page, 9998.99);
      await dollars.press("ArrowUp");
      assert.equal(
        await page.locator("#price-value").textContent(),
        "$9,999.99",
      );
      await dollars.press("ArrowDown");
      assert.equal(
        await page.locator("#price-value").textContent(),
        "$9,998.99",
      );
      await setPrice(page, 2.99);
      await page
        .getByRole("button", { name: "How to play", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#price-value").textContent(), "$2.99");
      await inspect("price-selected");
      await page.getByRole("button", { name: "Lock in", exact: true }).click();
      await page.locator(".visual-reveal").waitFor();
      await inspect("price-result");
      await page.goto(`${base}/sudoku/`);
      const puzzle = makeBoard("sudoku", day),
        index = puzzle.initial.findIndex((v) => !v);
      const cell = page.locator(`[data-cell="${index}"]`);
      await cell.waitFor();
      assert.equal(await page.locator(".sudoku-grid input").count(), 0);
      await cell.click();
      await page.getByRole("button", { name: "Place 3", exact: true }).click();
      assert.equal(await cell.textContent(), "3");
      await page.reload();
      assert.equal(await cell.textContent(), "3");
      await cell.click();
      await page.getByRole("button", { name: "Erase", exact: true }).click();
      assert.equal(await cell.textContent(), "");
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.equal(await cell.textContent(), "3");
      await cell.focus();
      await cell.press("Backspace");
      assert.equal(await cell.textContent(), "");
      await cell.press("9");
      assert.equal(await cell.textContent(), "");
      await cell.press("2");
      assert.equal(await cell.textContent(), "2");
      const nextCell = puzzle.initial.findIndex(
        (v, i) => i > index && i < 6 && !v,
      );
      if (nextCell >= 0) {
        await cell.press("ArrowRight");
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.cell),
          String(nextCell),
        );
      }
      const given = puzzle.initial.findIndex(Boolean);
      assert.equal(
        await page.locator(`[data-cell="${given}"]`).isDisabled(),
        true,
      );
      await inspect("sudoku-entry");
      for (let i = 0; i < 36; i++)
        if (!puzzle.initial[i]) {
          await page.locator(`[data-cell="${i}"]`).click();
          await page
            .getByRole("button", {
              name: `Place ${puzzle.solution[i]}`,
              exact: true,
            })
            .click();
        }
      await page
        .locator("#puzzle-title")
        .filter({ hasText: "Solved" })
        .waitFor();
      assert.equal(await page.locator(".sudoku-palette").count(), 0);
      await inspect("sudoku-solved");
      await page.goto(`${base}/ladderrot/`);
      const input = page.getByLabel("Next word", { exact: true });
      await input.waitFor();
      const raw = JSON.parse(
        await fs.readFile("dist/games/data/ladderrot.json", "utf8"),
      );
      const words = JSON.parse(
        await fs.readFile("dist/games/data/ladder-words.json", "utf8"),
      );
      const ladder = extraPuzzle(
        "ladderrot",
        prepareExtra("ladderrot", raw, words),
        day,
      );
      assert.equal(await input.inputValue(), ladder.start.toUpperCase());
      const next = ladder.solution[1].toUpperCase();
      const position = [...next].findIndex(
        (x, i) => x !== ladder.start.toUpperCase()[i],
      );
      await input.focus();
      for (let i = 0; i < position; i++) await input.press("ArrowRight");
      const selection = await input.evaluate((n) => [
        n.selectionStart,
        n.selectionEnd,
      ]);
      assert.deepEqual(selection, [position, position + 1]);
      await page.keyboard.insertText(next[position]);
      assert.equal(await input.inputValue(), next);
      await input.press("Enter");
      assert.equal(await input.inputValue(), next);
      await input.fill("ZZZZ");
      await input.press("Enter");
      assert.match(
        await page.locator(".rot-feedback").first().textContent(),
        /exactly one letter/,
      );
      await inspect("ladder-editing");
      await page.reload();
      assert.equal(await input.inputValue(), next);
      await page
        .getByRole("button", { name: "Undo last word", exact: true })
        .click();
      assert.equal(await input.inputValue(), ladder.start.toUpperCase());
      assert.deepEqual(errors, []);
      receipts.push({
        viewport,
        colorScheme,
        checks: [
          "price pointer and keyboard",
          "cent precision and full range",
          "price help and submission",
          "sudoku palette, erase, undo, reload, keyboard, solve",
          "ladder single-letter replacement, validation, reload, undo",
        ],
      });
      await context.close();
    }
} finally {
  await browser.close();
  await fs.writeFile(
    `${out}/receipt${process.argv.includes("--webkit") ? "-webkit" : ""}.json`,
    JSON.stringify({ base, receipts, reports }, null, 2),
  );
}
assert.deepEqual(
  reports.flatMap((r) =>
    (r.findings ?? []).filter((f) => f.status !== "unresolved"),
  ),
  [],
);
console.log(
  `${receipts.length} gesture-input journeys passed${process.argv.includes("--webkit") ? "; UI audit unavailable in WebKit" : ", including UI policy"}.`,
);
