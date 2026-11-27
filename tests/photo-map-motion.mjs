import { ciWidths } from "./ci-parts.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
import { prepareVisual, visualSet } from "../dist/games/visual-puzzles.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const out = `test-results/photo-map-motion/${engine.name()}`;
const browser = await engine.launch(),
  receipts = [],
  reports = [],
  failures = [];
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const day = "2026-11-26";
const games = [
  "train",
  "flags",
  "languages",
  "vocabulary",
  "maprot",
  "yearrot",
  "borderrot",
  "ladderrot",
  "cluerot",
  "skyrot",
  "pricerot",
  "skylinerot",
  "zoomrot",
];
await fs.mkdir(out, { recursive: true });
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
function activate(control, width) {
  return width === 390 ? control.tap() : control.click();
}
async function measure(page, action) {
  await page.evaluate(() => {
    window.motionSamples = [];
    window.motionMeasuring = true;
    function sample() {
      if (!window.motionMeasuring) return;
      const frame = document.querySelector(
        "iframe[title]:not([hidden]):not(.feed-loading)",
      );
      const doc = frame?.contentDocument ?? document;
      const anchor = doc.querySelector(
        ".visual-figure, #question-title, .rot-map-surface",
      );
      const rect = anchor?.getBoundingClientRect();
      window.motionSamples.push({
        scroll: scrollY,
        inner: frame?.contentWindow.scrollY ?? 0,
        anchor: rect ? rect.y + (frame?.getBoundingClientRect().y ?? 0) : null,
        cardBottom: document
          .querySelector("main.main,.feed-body")
          ?.getBoundingClientRect().bottom,
      });
      requestAnimationFrame(sample);
    }
    sample();
  });
  await action();
  // Keep real frame timing: short focus/resize races must be observable.
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    window.motionMeasuring = false;
    return window.motionSamples;
  });
}
function verify(name, samples, keepHeight = false) {
  const first = samples[0];
  const result = { name, samples };
  receipts.push(result);
  try {
    assert.ok(
      samples.length > 2,
      "Measured the transition over rendered frames",
    );
    assert.ok(
      samples.every((s) => Math.abs(s.scroll - first.scroll) <= 1),
      `${name}: preserve the page scroll position`,
    );
    assert.ok(
      samples.every((s) => s.inner === 0),
      `${name}: embedded focus must not scroll before the frame resizes`,
    );
    assert.ok(
      samples.every((s) => Math.abs(s.anchor - first.anchor) <= 1),
      `${name}: keep the puzzle in place`,
    );
    if (keepHeight)
      assert.ok(
        samples.every((s) => s.cardBottom >= first.cardBottom - 1),
        `${name}: result card must not collapse`,
      );
  } catch (error) {
    failures.push(error.message);
  }
}
async function inspect(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  if (engine === chromium && !name.includes("before"))
    reports.push({ name, ...(await checkPage(page, policy)) });
}
try {
  for (const width of ciWidths([390, 1440]))
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 620 : 1000 },
        colorScheme: "light",
        reducedMotion,
        hasTouch: width === 390,
        isMobile: width === 390,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.clock.setFixedTime(new Date(day + "T17:00:00Z"));
      for (const game of ["skyrot", "skylinerot", "zoomrot"]) {
        await page.addInitScript(
          ({ skips, day }) => {
            if (window === parent)
              localStorage.setItem(
                `dailyo:daily-feed:skipped:${day}`,
                JSON.stringify(skips),
              );
          },
          { skips: games.slice(0, games.indexOf(game)), day },
        );
        await page.goto(`${base}/daily/`, { waitUntil: "domcontentloaded" });
        const child = page.frameLocator(`iframe[title=${game}]`);
        await child.locator(".choice").first().waitFor();
        await child
          .locator("img")
          .evaluateAll((imgs) =>
            Promise.all(imgs.map((img) => img.decode().catch(() => null))),
          );
        await settle(page);
        const raw = JSON.parse(
          await fs.readFile(`dist/games/data/${game}.json`, "utf8"),
        );
        const q = visualSet(game, prepareVisual(game, raw), day)[0];
        const wrong = child.getByRole("button", {
          name: q.options.find((option) => option.id !== q.item.id).name,
          exact: true,
        });
        await wrong.scrollIntoViewIfNeeded();
        await settle(page);
        const name = `${width}-${reducedMotion}-daily-${game}`;
        await inspect(page, name + "-before");
        verify(
          name + "-retry",
          await measure(page, () => activate(wrong, width)),
        );
        await inspect(page, name + "-retry");
        assert.match(
          await child.locator("#visual-feedback").innerText(),
          /2 guesses left/,
        );
        const correct = child.getByRole("button", {
          name: q.item.name,
          exact: true,
        });
        await correct.scrollIntoViewIfNeeded();
        await settle(page);
        verify(
          name + "-correct",
          await measure(page, () => activate(correct, width)),
          true,
        );
        await inspect(page, name + "-correct");
        const next = child.getByRole("button", { name: "Next", exact: true });
        await next.click();
        await child.locator(".choice").first().waitFor();
        assert.equal(
          await child.locator("#quiz").evaluate((n) => n.style.minHeight),
          "",
          "A new question releases the previous result height",
        );
      }
      await context.close();
      // Separate storage keeps standalone practice independent of the Daily fixture.
      for (const game of [
        "skyrot",
        "skylinerot",
        "zoomrot",
        "orderrot",
        "pricerot",
      ]) {
        const page = await browser.newPage({
          viewport: { width, height: width === 390 ? 620 : 1000 },
          colorScheme: "dark",
          hasTouch: width === 390,
          isMobile: width === 390,
          reducedMotion,
        });
        await page.goto(`${base}/${game}/?practice=1`, {
          waitUntil: "domcontentloaded",
        });
        const reveal = page.getByRole("button", {
          name: "Show answer",
          exact: true,
        });
        await reveal.waitFor();
        await page
          .locator("img")
          .evaluateAll((imgs) =>
            Promise.all(imgs.map((img) => img.decode().catch(() => null))),
          );
        await reveal.scrollIntoViewIfNeeded();
        await settle(page);
        const name = `${width}-${reducedMotion}-practice-${game}`;
        await inspect(page, name + "-before");
        verify(name, await measure(page, () => activate(reveal, width)), true);
        await inspect(page, name + "-result");
        assert.match(
          await page.locator("#visual-feedback").innerText(),
          /Answer revealed/,
        );
        assert.equal(
          await page
            .locator("#visual-feedback")
            .evaluate((n) => n === document.activeElement),
          true,
          "Feedback retains keyboard focus",
        );
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await reveal.waitFor();
        assert.equal(
          await page.locator("#quiz").evaluate((n) => n.style.minHeight),
          "",
        );
        if (game === "skyrot") {
          await activate(reveal, width);
          assert.notEqual(
            await page.locator("#quiz").evaluate((n) => n.style.minHeight),
            "",
          );
          await page
            .getByRole("button", { name: "Daily", exact: true })
            .click();
          assert.equal(
            await page.locator("#quiz").evaluate((n) => n.style.minHeight),
            "",
            "Changing mode releases the previous result height",
          );
          await page
            .getByRole("button", { name: "Practice", exact: true })
            .click();
          await page.getByLabel("Difficulty").selectOption("hard");
          assert.equal(
            await page.locator("#quiz").evaluate((n) => n.style.minHeight),
            "",
            "Changing difficulty releases the previous result height",
          );
        }
        await page.close();
      }
      const mapPage = await browser.newPage({
        viewport: { width, height: width === 390 ? 620 : 1000 },
        reducedMotion,
        hasTouch: width === 390,
        isMobile: width === 390,
        colorScheme: "dark",
      });
      await mapPage.goto(`${base}/rush/maprot/`, {
        waitUntil: "domcontentloaded",
      });
      const child = mapPage.frameLocator("iframe[title=maprot]");
      const enlarge = child.getByRole("button", {
        name: "Enlarge map",
        exact: true,
      });
      await enlarge.waitFor();
      for (let repeat = 0; repeat < 2; repeat++) {
        await activate(enlarge, width);
        await child.locator("dialog[open]").waitFor();
        await settle(mapPage);
        // Sample the close itself; opening fullscreen deliberately changes geometry.
        const samples = await measure(mapPage, () =>
          activate(
            child.getByRole("button", { name: "Close", exact: true }),
            width,
          ),
        );
        receipts.push({
          name: `${width}-${reducedMotion}-map-close-${repeat}`,
          samples,
        });
        if (samples.some((s) => s.inner !== 0))
          failures.push(
            `${width}-${reducedMotion}: map-close focus scrolled the embedded frame`,
          );
        assert.equal(
          await enlarge.evaluate((n) => n === document.activeElement),
          true,
        );
      }
      await inspect(mapPage, `${width}-${reducedMotion}-map-return`);
      await mapPage.close();
    }
} finally {
  await browser.close();
  await fs.writeFile(`${out}/receipt.json`, JSON.stringify(receipts, null, 2));
  await fs.writeFile(`${out}/ui.json`, JSON.stringify(reports, null, 2));
}
assert.deepEqual(
  reports.flatMap((r) => r.findings.filter((f) => f.status !== "unresolved")),
  [],
);
assert.deepEqual(failures, []);
console.log(
  `${engine.name()}: Daily retries, standalone results, new-round reset, keyboard focus and map-close motion passed at both sizes and motion preferences`,
);
