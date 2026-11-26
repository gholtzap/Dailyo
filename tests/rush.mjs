import { rushSeed, initialMixedRun, seedMixedRun } from "./rush-helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { rushDate, shuffle } from "../dist/daily/puzzles.js";
import {
  makeSet,
  preparePuzzles,
  roundCount,
} from "../dist/games/rot-puzzles.js";
import { extraPuzzle, prepareExtra } from "../dist/games/extra-puzzles.js";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(
  await fs.readFile(new URL("../ui-policy.json", import.meta.url)),
);
const day = "2026-11-16",
  start = new Date(`${day}T16:00:00Z`);
assert.equal(rushDate("2024-02-29", day), "2024-02-29");
for (const invalid of [null, "2026-02-29", "2026-11-17", "2026-11-1"])
  assert.equal(rushDate(invalid, day), day);
const lint = process.argv.includes("--ui"),
  reports = [];
const browser = await chromium.launch();
try {
  for (const viewport of policy.viewports) {
    const { width } = viewport;
    const page = await browser.newPage({
      viewport,
      colorScheme: "dark",
      hasTouch: width === 390,
      isMobile: width === 390,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await initialMixedRun(page, day);
    const errors = [],
      writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() === "POST") writes.push(request.url());
    });
    await page.clock.install({ time: new Date(start - 10000) });
    await page.clock.pauseAt(start);
    let failFlag = true;
    await page.route("**/games/data/flags.json", (route) => {
      if (!failFlag) return route.continue();
      failFlag = false;
      return route.fulfill({ status: 503 });
    });
    const inspect = async (name, child = false) => {
      if (!lint) return;
      await page.clock.resume();
      reports.push({
        name: `${width}-${name}`,
        ...(await checkPage(page, policy)),
      });
      if (child) {
        const frame = await (
          await page
            .locator("iframe:not(.feed-loading):not([hidden])")
            .elementHandle()
        ).contentFrame();
        reports.push({
          name: `${width}-${name}-game`,
          ...(await checkPage(frame, policy)),
        });
      }
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    };
    const status = page.locator("#rush-status");
    const timer = page.locator("#rush-clock");
    const track = page.locator(".rush-track");
    const game = (name) => page.frameLocator(`iframe[title="${name}"]`);
    const loadJson = async (path) =>
      (await page.request.get(new URL(path, base).href)).json();

    await page.goto(base);
    await page.getByRole("link", { name: "Rush", exact: true }).waitFor();
    await status.filter({ hasText: "Flags didn’t load." }).waitFor();
    await inspect("error");
    await page.getByText("Games", { exact: true }).press("Enter");
    await page
      .getByRole("navigation", { name: "Games" })
      .getByRole("link", { name: /^Words$/ })
      .waitFor();
    await inspect("directory");
    for (const removed of ["ladderrot", "cluerot"])
      assert.equal(
        await page.locator(`a[href='/rush/${removed}/']`).count(),
        0,
      );
    await page.getByText("Games", { exact: true }).press("Enter");
    await page
      .getByRole("button", { name: "Retry", exact: true })
      .press("Enter");
    const flags = await loadJson("/games/data/flags.json");
    const flagDeck = shuffle(flags, await rushSeed(page, "flags"));
    const flag = game("flagrot");
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.equal(await timer.isVisible(), false);
    assert.equal(
      await page
        .getByRole("button", { name: "Skip game", exact: true })
        .getAttribute("class"),
      "secondary rush-skip",
    );
    await page.clock.fastForward(30000);
    assert.equal(await timer.textContent(), "");
    assert.equal(await track.isVisible(), false);
    assert.equal(
      await flag
        .locator("#question-title")
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await inspect("flagrot", true);
    const preloadedFlag = page.locator(
      `iframe[src^="/flags/?rush=1&date=${day}&run="]`,
    );
    assert.equal(await preloadedFlag.evaluate((node) => node.inert), true);
    await preloadedFlag.evaluate((node) => {
      node.dataset.preloadCheck = "";
    });
    await flag
      .getByRole("button", { name: flagDeck[0].name, exact: true })
      .press("Enter");
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.clock.fastForward(200);
    await timer.filter({ hasText: "8s" }).waitFor();
    assert.equal(
      await page.locator("iframe[title=flagrot][data-preload-check]").count(),
      1,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await track.waitFor({ state: "visible" });
    const meter = () =>
      track.evaluate((node) => {
        const fill = node.firstElementChild;
        const { backgroundColor } = getComputedStyle(fill);
        const [red, green] = backgroundColor.match(/\d+/g).map(Number);
        return { width: fill.getBoundingClientRect().width, red, green };
      });
    // Pause preserves the deadline, rejects late answers, and resumes explicitly.
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await status.filter({ hasText: "Paused" }).waitFor();
    await page.clock.fastForward(20000);
    assert.equal(await timer.textContent(), "8s");
    await flag
      .locator("body")
      .evaluate(() =>
        parent.postMessage(
          { type: "rush-game", phase: "answered", correct: true },
          location.origin,
        ),
      );
    assert.match(await status.textContent(), /Paused/);
    assert.equal(
      await page
        .getByRole("button", { name: "Skip game", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await status.filter({ hasText: "Flags · Round 2" }).waitFor();
    // A controlled visibility event exercises backgrounding in headless Chromium.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await status.filter({ hasText: "Paused" }).waitFor();
    await page.clock.fastForward(20000);
    assert.equal(await timer.textContent(), "8s");
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.match(
      await status.textContent(),
      /Paused/,
      "Returning must not start the clock until Resume",
    );
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    const full = await meter();
    assert.ok(full.width > 30 && full.red > full.green);
    await page.clock.fastForward(4000);
    const half = await meter();
    assert.equal(await timer.textContent(), "4s");
    assert.ok(half.width / full.width > 0.45 && half.width / full.width < 0.55);
    await page.clock.fastForward(3500);
    const low = await meter();
    assert.equal(await timer.textContent(), "1s");
    assert.ok(low.width / full.width < 0.1 && low.red > low.green);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const [round, seconds] of [
      [1, 6],
      [2, 4],
      [3, 4],
      [4, 4],
    ]) {
      await flag
        .getByRole("button", { name: flagDeck[round].name, exact: true })
        .click();
      await status.filter({ hasText: "Correct" }).waitFor();
      await page.clock.fastForward(200);
      await timer.filter({ hasText: `${seconds}s` }).waitFor();
      assert.equal(await status.textContent(), `Flags · Round ${round + 2}`);
    }
    await flag
      .getByRole("group", { name: "Choose a place" })
      .getByRole("button")
      .filter({
        hasNotText: flagDeck[5].name,
      })
      .first()
      .click();
    await status.filter({ hasText: "Missed" }).waitFor();
    await flag
      .locator(".choice.correct")
      .filter({ hasText: flagDeck[5].name })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Next game", exact: true })
        .getAttribute("class"),
      "primary rush-continue",
    );
    await inspect("miss", true);
    await page.clock.fastForward(2400);

    const language = game("langrot");
    await timer.filter({ hasText: "8s" }).waitFor();
    const languages = await loadJson("/games/data/languages.json");
    const firstLanguage = shuffle(
      languages,
      await rushSeed(page, "languages"),
    )[0];
    await language
      .getByRole("button", { name: firstLanguage.name, exact: true })
      .click();
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.clock.fastForward(200);
    await timer.filter({ hasText: "6s" }).waitFor();
    await inspect("langrot", true);
    await page.clock.fastForward(6100);
    await status.filter({ hasText: "Time’s up" }).waitFor();
    await language.locator(".choice.correct").waitFor();
    await page.clock.fastForward(2400);

    const next = page.locator("#rush-next");
    const rot = async (kind, round = 0) => {
      const data = preparePuzzles(
        kind,
        await loadJson(`/games/data/${kind}.json`),
      );
      const index = round % roundCount;
      return {
        data,
        question: makeSet(
          kind,
          data,
          await rushSeed(page, kind),
          round - index,
        )[index],
      };
    };
    const placeYear = async (child, round = 0) => {
      const {
        question: { event, timeline },
      } = await rot("yearrot", round);
      await child
        .locator(".rot-slot")
        .nth(timeline.filter(([year]) => year < event[0]).length)
        .click();
    };
    const slots = [
      [
        "Vocabulary",
        12,
        9,
        async (child) => {
          const words = await loadJson("/games/data/vocabulary.json");
          await child
            .getByRole("button", {
              name: shuffle(words, await rushSeed(page, "vocabulary"))[0].name,
              exact: true,
            })
            .click();
        },
      ],
      ["yearrot", 14, 10, placeYear],
    ];
    for (const [name, openingSeconds, seconds, solve] of slots) {
      if (name !== "Vocabulary") await next.click();
      await timer.filter({ hasText: `${openingSeconds}s` }).waitFor();
      await inspect(name, true);
      await solve(game(name));
      await status.filter({ hasText: "Correct" }).waitFor();
      await page.clock.fastForward(200);
      await timer.filter({ hasText: `${seconds}s` }).waitFor();
      if (name === "yearrot") {
        for (let round = 1; round <= roundCount; round++) {
          await placeYear(game(name), round);
          await status.filter({ hasText: "Correct" }).waitFor();
          await page.clock.fastForward(200);
          await status
            .filter({ hasText: `Timeline · Round ${round + 2}` })
            .waitFor();
        }
      }
    }
    for (let i = 0; i < 9; i++) await next.click();
    await page.getByRole("heading", { name: "Rush recap" }).waitFor();
    assert.equal(await page.locator("#rush-score").textContent(), "13 correct");
    assert.equal(
      await page.locator("#rush-personal-best").textContent(),
      "New best · 13 correct",
    );
    assert.deepEqual(await page.evaluate(() => Object.entries(localStorage)), [
      ["dailyo:rush:best:all", "13"],
    ]);
    assert.deepEqual(writes, []);
    await page.getByRole("button", { name: "Copy results" }).press("Enter");
    await page
      .locator("#rush-copy-status")
      .filter({ hasText: "Copied" })
      .waitFor();
    const share = await page.evaluate(() => navigator.clipboard.readText());
    const recapRows = await page
      .locator("#feed-results li span")
      .allTextContents();
    assert.equal(recapRows.length, 12);
    assert.ok(recapRows.every((row) => !/ladderrot|cluerot/.test(row)));
    assert.equal(
      share,
      [
        `dailyo Rush · ${day}`,
        "13 correct · 6 in Timeline",
        "",
        ...recapRows,
        "",
        `https://trainrot.vercel.app/rush/?date=${day}`,
      ].join("\n"),
    );
    await inspect("recap");
    await page.getByRole("button", { name: "Play again" }).click();
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.equal(await timer.isVisible(), false);
    for (let i = 0; i < 12; i++)
      await page
        .getByRole("button", { name: "Skip game", exact: true })
        .click();
    assert.equal(await page.locator("#rush-score").textContent(), "0 correct");
    assert.equal(await page.locator("#rush-copy-status").textContent(), "");
    assert.equal(
      await page.locator("#rush-personal-best").textContent(),
      "Personal best · 13 correct",
    );
    await page.locator(".rush-breakdown > summary").click();
    await page.getByRole("link", { name: "Play more Languages" }).click();
    await page
      .getByRole("button", { name: "Practice", exact: true, pressed: true })
      .waitFor();
    await page.goto(base);
    await page.getByRole("heading", { name: "Rush recap" }).waitFor();
    await page.getByRole("button", { name: "Play again" }).click();
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.equal(await timer.isVisible(), false);
    await page.getByRole("link", { name: "Daily mix", exact: true }).click();
    await page.waitForURL("**/daily/");
    await page.getByRole("link", { name: "Daily mix", exact: true }).waitFor();
    if (new URL(base).hostname === "127.0.0.1") {
      await page.route("**/rush/**", async (route) => {
        await route.fulfill({ response: await page.request.get(base) });
      });
    }
    const sharedChallenge = new URL(share.split("\n").at(-1));
    await seedMixedRun(page, day);
    await page.clock.setFixedTime(new Date("2026-11-17T16:00:00Z"));
    await page.goto(
      new URL(sharedChallenge.pathname + sharedChallenge.search, base).href,
    );
    const sharedDeck = shuffle(flags, await rushSeed(page, "flags"));
    await game("flagrot")
      .getByRole("button", { name: sharedDeck[0].name, exact: true })
      .click();
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.clock.fastForward(200);
    await game("flagrot")
      .getByRole("button", { name: sharedDeck[1].name, exact: true })
      .click();
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.goto(new URL(`/rush/scalerot/?date=${day}`, base).href);
    await status.filter({ hasText: "Round 1" }).waitFor();
    assert.equal(await page.locator("#rush-clock").isVisible(), false);
    const scale = game("scalerot");
    const data = prepareExtra(
      "scalerot",
      await loadJson("/games/data/scalerot.json"),
    );
    const puzzle = extraPuzzle(
      "scalerot",
      data,
      `${await rushSeed(page, "scalerot")}:0`,
    );
    await scale.getByRole("spinbutton").fill(String(puzzle.actual));
    await scale.getByRole("button", { name: "Check estimate" }).click();
    await status.filter({ hasText: "Correct" }).waitFor();
    await page.clock.fastForward(200);
    await timer.filter({ hasText: "20s" }).waitFor();
    await page.clock.fastForward(20100);
    await scale.locator(".estimate-comparison").waitFor();
    await page.clock.fastForward(2400);
    await page.locator(".rush-breakdown > summary").click();
    await page.locator("#feed-results li").waitFor();
    assert.equal(await page.locator("#feed-results li").count(), 1);
    assert.equal(
      await page.locator("#rush-personal-best").textContent(),
      "New best · 1 correct",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("dailyo:rush:best:all")),
      "13",
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("dailyo:rush:best:scalerot"),
      ),
      "1",
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", { value: undefined }),
    );
    await page.getByRole("button", { name: "Copy results" }).click();
    const manual = page.getByRole("textbox", { name: "Rush results to copy" });
    assert.equal(
      await manual.inputValue(),
      `dailyo Rush · Estimates · ${day}\n1 correct\n\nhttps://trainrot.vercel.app/rush/scalerot/?date=${day}`,
    );
    assert.ok(
      await manual.evaluate(
        (node) =>
          node === document.activeElement &&
          node.selectionEnd === node.value.length &&
          node.selectionStart === 0,
      ),
    );
    await inspect("copy fallback");
    // Saved links fall back to the remaining Rush rotation; standalone games stay playable.
    for (const removed of ["ladderrot", "cluerot"]) {
      await page.goto(`${base}/rush/${removed}/`);
      await status.filter({ hasText: "Round 1" }).waitFor();
      assert.equal(await page.locator(`iframe[title='${removed}']`).count(), 0);
      await page.goto(`${base}/${removed}/`);
      await page.locator("#extra-title").waitFor();
      assert.equal(
        await page.locator(`body[data-game='${removed}']`).count(),
        1,
      );
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${width}px Rush: all twelve mixed games, one untimed opener, preloaded swaps, timed rounds, misses, timeouts and single-game links passed`,
    );
  }
  if (lint) {
    await fs.mkdir("test-results", { recursive: true });
    await fs.writeFile(
      "test-results/rush-ui.json",
      JSON.stringify(reports, null, 2),
    );
    for (const { name, findings } of reports)
      console.log(`${name}: ${findings.length} findings`);
    if (reports.some((report) => report.findings.length)) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
