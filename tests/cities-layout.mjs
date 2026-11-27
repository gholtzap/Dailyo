import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
await fs.mkdir("test-results/cities-layout", { recursive: true });
try {
  for (const width of [390, 1440]) {
    for (const host of ["rush", "daily"]) {
      const page = await browser.newPage({
        viewport: { width, height: 568 },
        reducedMotion: "reduce",
      });
      await page.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
      await page.goto(
        host === "rush" ? `${base}/rush/maprot/` : `${base}/daily/`,
      );
      if (host === "daily") {
        for (let n = 0; n < 14; n++) {
          const active = page.locator("iframe[title]:not([hidden])");
          await active.waitFor();
          if ((await active.getAttribute("title")) === "maprot") break;
          const previous = await active.elementHandle();
          await page.locator("#feed-skip").click();
          await page.waitForFunction((node) => !node.isConnected, previous);
        }
      }
      const f = page.frameLocator('iframe[title="maprot"]');
      const map = f.locator(".rot-picking");
      await map.waitFor();
      await page.waitForFunction(() => {
        const f = document.querySelector('iframe[title="maprot"]');
        return (
          f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 2
        );
      });
      await map.click({ position: { x: 80, y: 60 } });
      const pin = await f.locator(".rot-pin").getAttribute("cx");
      const before = await map.boundingBox();
      await f.getByRole("button", { name: "Enlarge map", exact: true }).click();
      await f.locator("dialog[open]").waitFor();
      const expanded = await map.boundingBox();
      assert.ok(
        expanded.width >= before.width &&
          expanded.width * expanded.height > before.width * before.height,
        "Enlarge gives the atlas more usable area",
      );
      const frame = await page.locator('iframe[title="maprot"]').boundingBox();
      assert.equal(
        Math.round(frame.width),
        width,
        "Expanded frame uses the host viewport",
      );
      const header =
        host === "rush"
          ? await page.locator(".feed-actions").boundingBox()
          : { height: 0, y: 0 };
      assert.equal(Math.round(frame.height + header.height), 568);
      assert.equal(Math.round(frame.y), Math.round(header.y + header.height));
      await page.screenshot({
        path: `test-results/cities-layout/${engine.name()}-${width}-${host}-expanded.png`,
      });
      await f.getByRole("button", { name: "Close", exact: true }).click();
      await page.waitForFunction(
        () => !document.querySelector("iframe.feed-map-expanded"),
      );
      assert.equal(
        await f.locator(".rot-pin").getAttribute("cx"),
        pin,
        "Closing preserves the draft pin",
      );
      await f.getByRole("button", { name: "Check pin", exact: true }).click();
      if (host === "rush")
        await page
          .locator("#rush-status")
          .filter({ hasText: /Correct|Missed/ })
          .waitFor();
      else await f.locator(".rot-feedback").waitFor();
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  "Cities expands to the full host viewport, preserves the pin and submits from the normal board.",
);
