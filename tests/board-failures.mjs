import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { makeBoard } from "../dist/games/board-state.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4186";
const browser = await chromium.launch();
const receipts = [];
const day = "2026-11-26";
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      colorScheme: "light",
    });
    page.setDefaultTimeout(10000);
    await page.clock.setFixedTime(new Date(day + "T17:00:00Z"));
    await page.goto(`${base}/path/`);
    await page.locator(".puzzle-grid").waitFor();
    const path = makeBoard("path", day);
    const centers = [];
    for (const cell of path.solution.slice(0, 4)) {
      const r = await page.locator(`[data-cell="${cell}"]`).boundingBox();
      centers.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    }
    if (width === 390) {
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [centers[0]],
      });
      for (const point of centers.slice(1))
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [point],
        });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page.mouse.move(centers[0].x, centers[0].y);
      await page.mouse.down();
      for (const point of centers.slice(1))
        await page.mouse.move(point.x, point.y, { steps: 3 });
      await page.mouse.up();
    }
    assert.match(
      await page.locator(".puzzle-progress").innerText(),
      /^4 of 25/,
    );
    await page.reload();
    await page.locator(".puzzle-grid").waitFor();
    assert.match(
      await page.locator(".puzzle-progress").innerText(),
      /^4 of 25/,
    );
    await page.goto(`${base}/groups/`);
    await page.locator(".puzzle-grid").waitFor();
    const groups = makeBoard("groups", day);
    for (let guess = 0; guess < 4; guess++) {
      while (await page.locator(".puzzle-cell.is-picked").count())
        await page.locator(".puzzle-cell.is-picked").first().click();
      for (const group of groups.groups)
        await page
          .locator(`[data-cell="${groups.items.indexOf(group.words[guess])}"]`)
          .click();
      await page
        .getByRole("button", { name: "Submit group", exact: true })
        .click();
      if (guess === 0) {
        await page
          .getByRole("button", { name: "Submit group", exact: true })
          .click();
        assert.match(
          await page.locator(".puzzle-progress").innerText(),
          /^3 mistakes/,
        );
      }
    }
    await page
      .locator("#puzzle-title")
      .filter({ hasText: "Not solved" })
      .waitFor();
    await page.reload();
    await page
      .locator("#puzzle-title")
      .filter({ hasText: "Not solved" })
      .waitFor();
    await page
      .getByRole("button", { name: "Show answer", exact: true })
      .click();
    await page
      .locator("#puzzle-title")
      .filter({ hasText: "Answer shown" })
      .waitFor();
    await page.goto(`${base}/wordgrid/`);
    await page.locator(".puzzle-grid").waitFor();
    const words = makeBoard("wordgrid", day);
    const movable = words.initial.flatMap((v, i) =>
      v !== words.solution[i] ? [i] : [],
    );
    const pair = movable.flatMap((a) =>
      movable
        .filter(
          (b) =>
            a < b &&
            words.initial[a] !== words.initial[b] &&
            words.initial[a] !== words.solution[b] &&
            words.initial[b] !== words.solution[a],
        )
        .map((b) => [a, b]),
    )[0];
    assert.ok(pair);
    for (let n = 0; n < 15; n++)
      for (const cell of pair)
        await page.locator(`[data-cell="${cell}"]`).click();
    await page
      .locator("#puzzle-title")
      .filter({ hasText: "Not solved" })
      .waitFor();
    await page.reload();
    await page
      .locator("#puzzle-title")
      .filter({ hasText: "Not solved" })
      .waitFor();
    await page
      .getByRole("button", { name: "Show answer", exact: true })
      .click();
    await page
      .locator("#puzzle-title")
      .filter({ hasText: "Answer shown" })
      .waitFor();
    for (const game of ["crossword", "sudoku"]) {
      await page.goto(`${base}/${game}/`);
      const entry = page
        .locator(
          game === "sudoku"
            ? ".sudoku-cell:not(:disabled)"
            : "input.puzzle-input:not([readonly])",
        )
        .first();
      await entry.waitFor();
      const value = () =>
        game === "sudoku" ? entry.textContent() : entry.inputValue();
      if (game === "sudoku") {
        await entry.focus();
        await entry.press("9");
      } else await entry.fill("9");
      assert.equal(await value(), "");
      if (game === "sudoku") await entry.press("1");
      else await entry.fill("A");
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.equal(await value(), "");
      if (game === "sudoku") {
        await entry.focus();
        await entry.press("2");
      } else await entry.fill("B");
      await entry.press("Backspace");
      assert.equal(await value(), "");
      await page
        .getByRole("button", { name: "Check answers", exact: true })
        .click();
      assert.match(
        await page.locator(".rot-feedback").innerText(),
        /another look/,
      );
    }
    receipts.push({
      width,
      checks: [
        "four mistakes",
        "repeated guess",
        "swap exhaustion",
        "failed reload",
        "truthful answer review",
        "invalid input",
        "undo",
        "backspace",
        "checking",
      ],
    });
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/board-games/failures.json",
    JSON.stringify({ base, receipts }, null, 2),
  );
}
console.log(
  "Board-game failure, editing and recovery journeys passed on mobile and desktop.",
);
