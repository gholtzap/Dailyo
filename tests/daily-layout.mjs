import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const b = await engine.launch();
const receipts = [];
const out = "test-results/daily-layout";
await fs.mkdir(out, { recursive: true });
try {
  for (const viewport of [
    { width: 390, height: 568 },
    { width: 1440, height: 1000 },
  ]) {
    const p = await b.newPage({
      viewport,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await p.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
    await p.goto(`${base}/daily/`);
    for (let n = 0; n < 14; n++) {
      const iframe = p.locator("iframe[title]:not([hidden])");
      await iframe.waitFor();
      const title = await iframe.getAttribute("title");
      const f = p.frameLocator(`iframe[title="${title}"]`);
      await f
        .getByRole("button", { name: "How to play", exact: true })
        .waitFor();
      await p.waitForFunction(() => {
        const f = document.querySelector("iframe[title]");
        return (
          f?.contentDocument?.documentElement.scrollHeight <= f.clientHeight + 2
        );
      });
      const overflow = await f.locator("body").evaluate(() =>
        [...document.querySelectorAll("#quiz button,#app button")]
          .filter((n) => n.checkVisibility())
          .filter((n) => n.getBoundingClientRect().bottom > innerHeight + 1)
          .map((n) => n.textContent),
      );
      assert.deepEqual(
        overflow,
        [],
        `${title}: controls inside the complete frame`,
      );
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      if (["flagrot", "Vocabulary", "pricerot", "skyrot"].includes(title)) {
        await f
          .locator("body")
          .evaluate(() =>
            Promise.all(
              [...document.images].map((i) => i.decode().catch(() => null)),
            ),
          );
        await p.screenshot({
          path: `${out}/${engine.name()}-${viewport.width}-${title}.png`,
          fullPage: true,
        });
      }
      const previous = await iframe.elementHandle();
      await p.locator("#feed-skip").click();
      await p.waitForFunction((node) => !node.isConnected, previous);
      receipts.push({ viewport, title });
    }
    await p.locator("#feed-recap").waitFor();
    assert.match(await p.locator("#feed-summary").innerText(), /14 skipped/);
    await p.close();
  }
} finally {
  await b.close();
}
await fs.writeFile(
  `${out}/${engine.name()}.json`,
  JSON.stringify(receipts, null, 2),
);
console.log(
  "All 14 Daily games render their complete content and controls; skip and recap remain usable.",
);
