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
    await p.goto(`${base}/trainrot/?practice=1`);
    await p.locator("[data-route]").first().waitFor();
    const key = await p.evaluate(() =>
      Object.keys(localStorage).find(
        (k) => k.startsWith("trainrot-endless-v1:") && !k.endsWith(":state"),
      ),
    );
    assert.ok(key);
    const snapshot = await p.evaluate((key) => localStorage.getItem(key), key);
    await p.locator("[data-route]").first().click();
    await p.locator("[data-route]").first().click();
    assert.equal(
      await p.evaluate((key) => localStorage.getItem(key), key),
      snapshot,
      "Answer edits must not rewrite the deck",
    );
    const checkpoint = await p.evaluate(
      (key) => JSON.parse(localStorage.getItem(key + ":state")),
      key,
    );
    assert.equal(checkpoint.state.legs.length, 2);
    assert.ok(!("deck" in checkpoint));
    await p.reload();
    await p.locator("#undo-train").waitFor();
    assert.equal(
      await p.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).state.legs.length,
        key,
      ),
      2,
    );
    await p.evaluate(
      (key) =>
        localStorage.setItem(
          key + ":state",
          JSON.stringify({
            revision: "stale",
            state: { phase: "revealed", legs: [] },
          }),
        ),
      key,
    );
    await p.reload();
    await p.locator("#undo-train").waitFor();
    assert.equal(
      await p.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).state.legs.length,
        key,
      ),
      2,
      "Stale checkpoints must not replace a newer deck's answer",
    );
    await p.close();
  }
} finally {
  await b.close();
}
console.log(
  "Practice keeps puzzles and their opening actions close to the mode controls.",
);
