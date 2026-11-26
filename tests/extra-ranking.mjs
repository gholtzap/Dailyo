import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import pg from "pg";
import { dailyDate } from "../dist/daily/puzzles.js";
import {
  extraGames,
  extraPuzzle,
  extraScoreLabel,
  prepareExtra,
} from "../dist/games/extra-puzzles.js";
import { scoreTestTime } from "./score-clock.mjs";

const base = process.env.TRAINROT_TEST_URL;
assert.ok(
  base && process.env.DATABASE_URL,
  "Use the disposable score API runner.",
);
assert.equal(new URL(base).hostname, "127.0.0.1");
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  ),
);
const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`../dist/games/data/${name}.json`, import.meta.url)),
  );
const day = dailyDate();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch();
const receipts = [];
await db.connect();
try {
  for (const game of extraGames) {
    const data = prepareExtra(
      game,
      game === "swaprot" ? undefined : read(game),
      game === "ladderrot" ? read("ladder-words") : undefined,
    );
    const puzzle = extraPuzzle(game, data, day);
    const scores = [];
    for (const [index, worse] of [true, false, false].entries()) {
      const context = await browser.newContext({
        viewport: { width: index ? 1440 : 390, height: 900 },
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.clock.setFixedTime(new Date(scoreTestTime));
        await page.goto(`${base}/${game}/`);
        await page.locator("#extra-title").waitFor();
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url() === `${base}/api/daily-score` &&
            response.request().method() === "POST",
        );
        let expected;
        if (game === "ladderrot") {
          for (const word of puzzle.solution.slice(1)) {
            await page.getByLabel("Next word").fill(word);
            await page.getByLabel("Next word").press("Enter");
          }
          expected = puzzle.solution.length - 1;
        } else if (game === "cluerot") {
          if (worse)
            await page
              .getByRole("button", { name: "Next clue", exact: true })
              .click();
          await page.getByLabel("Your guess").fill(puzzle.answer);
          await page.getByLabel("Your guess").press("Enter");
          expected = worse ? 2 : 1;
        } else if (game === "scalerot") {
          await page
            .getByRole("spinbutton")
            .fill(String(puzzle.actual * (worse ? 1.1 : 1)));
          await page
            .getByRole("button", { name: "Check estimate", exact: true })
            .click();
          expected = worse ? 1000 : 0;
        } else {
          const tiles = page.locator(".swap-tile");
          const swap = async (i) => {
            await tiles.nth(i).click();
            await tiles.nth(i + 1).click();
          };
          // Two cancelling swaps create a valid but worse completed result.
          if (worse) {
            await swap(0);
            await swap(0);
          }
          const board = [...puzzle.board];
          for (let pass = 0; pass < board.length; pass++)
            for (let i = 0; i < board.length - 1; i++) {
              if (board[i] <= board[i + 1]) continue;
              [board[i], board[i + 1]] = [board[i + 1], board[i]];
              await swap(i);
            }
          expected = puzzle.minimum + (worse ? 2 : 0);
        }
        const response = await responsePromise;
        assert.equal(response.status(), 200);
        const body = response.request().postDataJSON();
        assert.equal(body.puzzle, puzzle.id);
        assert.equal(body.day, day);
        const lower = scores.filter((score) => score > expected).length;
        const tied = scores.filter((score) => score === expected).length;
        const rank = { score: expected, lower, tied, others: scores.length };
        const actualRank = await response.json();
        assert.deepEqual(actualRank, rank);
        scores.push(expected);
        const label = !index
          ? "First finisher today"
          : lower
            ? `You placed ahead of ${Math.floor((100 * lower) / index)}% of today’s other finishers`
            : `${tied} other ${tied === 1 ? "finisher" : "finishers"} tied your score`;
        await page
          .locator(".daily-rank")
          .getByText(label, { exact: true })
          .waitFor();
        assert.equal(
          await page.locator("#extra-title").innerText(),
          extraScoreLabel(game, expected),
        );
        const post = (body) =>
          context.request.post(`${base}/api/daily-score`, {
            headers: { Origin: base },
            data: body,
          });
        const cookie = (await context.cookies()).find(
          (cookie) => cookie.name === "dailyo_player",
        );
        assert.ok(cookie, "The real endpoint issues a player cookie");
        const player = cookie.value.split(".")[0];
        const persisted = async () =>
          (
            await db.query(
              "SELECT score FROM daily_scores WHERE game=$1 AND day=$2 AND puzzle=$3 AND player=$4",
              [game, day, puzzle.id, player],
            )
          ).rows;
        assert.deepEqual(await persisted(), [{ score: expected }]);
        // Rejected requests cannot create or replace a result.
        assert.equal(
          (await post({ ...body, puzzle: body.puzzle + "-changed" })).status(),
          400,
        );
        assert.equal((await post({ ...body, answers: [false] })).status(), 400);
        assert.equal(
          (await post({ ...body, day: "2000-01-01" })).status(),
          400,
        );
        const repeated = await post(body);
        assert.equal(repeated.status(), 200);
        assert.deepEqual(await repeated.json(), rank);
        assert.deepEqual(await persisted(), [{ score: expected }]);
        if (worse && game !== "ladderrot") {
          const betterAnswers =
            game === "cluerot"
              ? [puzzle.answer]
              : game === "scalerot"
                ? [puzzle.actual]
                : body.answers.slice(2);
          const improved = await post({ ...body, answers: betterAnswers });
          assert.equal(improved.status(), 200);
          assert.deepEqual(
            await improved.json(),
            rank,
            "A later better submission cannot replace the first score",
          );
        }
        await page.reload();
        await page
          .locator(".daily-rank")
          .getByText(label, { exact: true })
          .waitFor();
        assert.deepEqual(await persisted(), [{ score: expected }]);
        assert.deepEqual(errors, []);
        receipts.push({
          game,
          player: index + 1,
          submitted: body,
          expected: rank,
          actual: actualRank,
          persistedRows: 1,
          invalidRequests: 3,
          reload: true,
        });
      } finally {
        await context.close();
      }
    }
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM daily_scores WHERE game=$1",
          [game],
        )
      ).rows[0].count,
      3,
    );
    console.log(
      `${game}: real browser submissions, Postgres persistence, ranks, ties, invalid-result rejection, idempotency and reload passed`,
    );
  }
} finally {
  await browser.close();
  await db.end();
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/extra-ranking.json",
    JSON.stringify(
      {
        command: "node scripts/test-score-api.mjs",
        environment: "loopback API and empty disposable Postgres",
        time: new Date(scoreTestTime).toISOString(),
        receipts,
      },
      null,
      2,
    ),
  );
}
