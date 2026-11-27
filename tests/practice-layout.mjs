import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const b = await engine.launch();
await fs.mkdir("test-results/practice-layout", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const p = await b.newPage({
      viewport: { width, height: 568 },
      reducedMotion: "reduce",
    });
    await p.addInitScript(() => {
      window.practiceReads = [];
      const read = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (/:practice(?:$|:)/.test(key)) window.practiceReads.push(key);
        return read.call(this, key);
      };
    });
    for (const game of [
      "zoomrot",
      "skylinerot",
      "pricerot",
      "yearrot",
      "maprot",
      "borderrot",
    ]) {
      await p.goto(`${base}/${game}/`);
      await p.locator("#quiz button").first().waitFor();
      assert.deepEqual(
        await p.evaluate(() => window.practiceReads),
        [],
        `${game}: Daily must not restore an unused practice session`,
      );
      await p.getByRole("button", { name: "Practice", exact: true }).click();
      await p.locator('#practice[aria-pressed="true"]').waitFor();
      assert.doesNotMatch(
        await p.locator("main").innerText(),
        /Daily difficulty\./,
      );
      await p
        .locator("body")
        .evaluate(() =>
          Promise.all(
            [...document.images].map((i) => i.decode().catch(() => null)),
          ),
        );
      if (width === 390 && game === "zoomrot") {
        const control = p
          .locator(
            game === "zoomrot" ? ".visual-choice" : ".angle-playfield button",
          )
          .first();
        await control.waitFor();
        const target =
          game === "zoomrot" ? p.locator(".visual-choice").last() : control;
        const box = await target.boundingBox();
        assert.ok(
          box.y + box.height <= 568,
          `${game}: opening answer is visible on a short phone`,
        );
      }
      if (game === "zoomrot") {
        assert.ok(
          (await p.locator("#practice-difficulty").boundingBox()).height >= 44,
          "Native difficulty selectors retain a full touch target",
        );
        await p.locator("#practice-difficulty").selectOption("hard");
        assert.match(
          await p.locator("#practice-difficulty-description").innerText(),
          /Tighter/,
        );
        await p.locator("#practice-difficulty").selectOption("standard");
        assert.equal(
          await p.locator("#practice-difficulty-description").isVisible(),
          false,
        );
      }
      await p.screenshot({
        path: `test-results/practice-layout/${engine.name()}-${width}-${game}.png`,
      });
    }
    await p.close();
  }
} finally {
  await b.close();
}
console.log(
  "Practice keeps puzzles and their opening actions close to the mode controls.",
);
