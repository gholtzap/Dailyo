import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const b = await engine.launch();
await fs.mkdir("test-results/photo-layout", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const p = await b.newPage({ viewport: { width, height: 844 } });
    for (const game of ["skylinerot", "zoomrot", "pricerot"]) {
      await p.goto(`${base}/rush/${game}/`);
      const f = p.frameLocator(`iframe[title="${game}"]`);
      const photo = f.locator(".visual-viewport");
      await photo.waitFor();
      await f
        .locator("body")
        .evaluate(() =>
          Promise.all(
            [...document.images].map((i) => i.decode().catch(() => null)),
          ),
        );
      const box = await photo.evaluate((n) => ({
        width: n.clientWidth,
        height: n.clientHeight,
        available: n.parentElement.clientWidth,
      }));
      assert.ok(
        box.height >= (width === 390 ? 140 : 300),
        `${game}: photo retains useful height`,
      );
      assert.ok(
        box.width >= box.available - 2,
        `${game}: photo fills its board`,
      );
      await p.screenshot({
        path: `test-results/photo-layout/${engine.name()}-${width}-${game}.png`,
      });
    }
    await p.close();
  }
} finally {
  await b.close();
}
console.log(
  "All three Rush photo games use the full board width on mobile and desktop.",
);
