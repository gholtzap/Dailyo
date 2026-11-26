import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
await fs.mkdir("test-results/world-label-layout", { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
    for (const city of ["rome", "istanbul", "san-francisco"]) {
      await page.goto(`${base}/trainrot-world/${city}/`);
      await page.locator(".map-marker-name").first().waitFor();
      const failures = await page
        .locator(".map-marker-name")
        .evaluateAll((names) =>
          names
            .filter((n) => n.checkVisibility())
            .flatMap((n) => {
              const range = document.createRange();
              range.selectNodeContents(n);
              const box = n.getBoundingClientRect();
              return [...range.getClientRects()]
                .filter(
                  (r) =>
                    r.left < box.left - 1 ||
                    r.right > box.right + 1 ||
                    r.bottom > box.bottom + 1,
                )
                .map(() => n.textContent);
            }),
        );
      assert.deepEqual(
        failures,
        [],
        `${city} ${width}: station text stays within its collision-tested label`,
      );
      if (city === "rome")
        await page.screenshot({
          path: `test-results/world-label-layout/${engine.name()}-${width}.png`,
        });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(
  "World station glyphs stay inside their labels at narrow and desktop widths.",
);
