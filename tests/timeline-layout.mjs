import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { makeSet, preparePuzzles } from "../dist/games/rot-puzzles.js";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const output = "test-results/timeline-layout";
await fs.mkdir(output, { recursive: true });
const data = preparePuzzles(
  "yearrot",
  JSON.parse(await fs.readFile("dist/games/data/yearrot.json", "utf8")),
);
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
const receipts = [];
try {
  for (const viewport of [
    { width: 390, height: 568 },
    { width: 390, height: 620 },
    { width: 1440, height: 1000 },
  ]) {
    const page = await browser.newPage({
      viewport,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await page.clock.install({ time: new Date("2026-11-26T17:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-26T17:00:01Z"));
    await page.goto(`${base}/rush/yearrot/`);
    for (let round = 0; round < 5; round++) {
      const iframe = page.locator("iframe[title=yearrot]");
      await iframe.waitFor();
      const params = new URL(await iframe.getAttribute("src"), base)
        .searchParams;
      const q = makeSet(
        "yearrot",
        data,
        `rush:yearrot:${params.get("date")}:${params.get("run")}`,
      )[round];
      const child = page.frameLocator("iframe[title=yearrot]");
      await child.locator(".rot-slot").first().waitFor();
      // Let the real layout observer settle while the controlled game clock stays still.
      await page.clock.runFor(100);
      await page.waitForFunction(() => {
        const frame = document.querySelector("iframe[title=yearrot]");
        return (
          frame?.contentDocument?.documentElement.scrollHeight <=
          frame.clientHeight + 2
        );
      });
      const bounds = await child.locator(".rot-slot").evaluateAll((ns) =>
        ns.map((n) => ({
          bottom: n.getBoundingClientRect().bottom,
          height: innerHeight,
        })),
      );
      assert.ok(
        bounds.every((r) => r.bottom <= r.height + 1),
        "Every answer must be inside the fully rendered frame",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      if (round === 3)
        await page.screenshot({
          path: `${output}/${engine.name()}-${viewport.width}-${viewport.height}.png`,
          fullPage: true,
        });
      const answer = child
        .locator(".rot-slot")
        .nth(q.timeline.filter(([year]) => year < q.event[0]).length);
      await answer.scrollIntoViewIfNeeded();
      assert.equal(
        await child.locator("body").evaluate(() => scrollY),
        0,
        "Scroll the page, not a clipped puzzle viewport",
      );
      if (round === 2 && viewport.width === 390) {
        const actions = page.locator(".feed-actions");
        const rect = await actions.boundingBox();
        assert.ok(
          rect.y >= 0 && rect.y < viewport.height,
          "Keep the clock visible while reading clues",
        );
      }
      await answer.click();
      await page.getByRole("button", { name: "Next", exact: true }).waitFor();
      if (round < 4) {
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page.clock.runFor(100);
      }
      receipts.push({ viewport, round: round + 1, answers: bounds.length });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  `${output}/${engine.name()}.json`,
  JSON.stringify(receipts, null, 2),
);
console.log(
  "Timeline: all clues and answers remain reachable across five Rush rounds; page scrolling retains the clock.",
);
