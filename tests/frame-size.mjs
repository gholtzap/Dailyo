import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
const receipts = [];
await fs.mkdir("test-results/frame-size", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 568 : 1000 },
      reducedMotion: "reduce",
    });
    await page.route("**/frame-size-host", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<!doctype html><div><iframe title="Viewport-dependent content" src="/frame-size-child" style="width:100%;height:450px"></iframe></div><script type="module">import {sizeFeedFrame} from '/daily/frame-size.js';sizeFeedFrame(document.querySelector('iframe'));</script>`,
      }),
    );
    await page.route("**/frame-size-child", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<!doctype html><style>body{margin:0}main{height:400px;position:relative}button{position:absolute;top:600px;height:44px} @media(min-height:500px){button{top:700px}}</style><main><button onclick="document.body.dataset.clicked='yes'">Continue</button></main>`,
      }),
    );
    await page.goto(`${base}/frame-size-host`);
    await page
      .frameLocator("iframe")
      .getByRole("button", { name: "Continue" })
      .waitFor();
    await page.waitForFunction(
      () => {
        const f = document.querySelector("iframe");
        return (
          f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 1
        );
      },
      {},
      { timeout: 3000 },
    );
    // A later host resize changes overflow without changing the main border box.
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      document.querySelector("iframe").style.height = "450px";
      dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(
      () => {
        const f = document.querySelector("iframe");
        return (
          f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 1
        );
      },
      {},
      { timeout: 3000 },
    );
    const frame = page.frameLocator("iframe");
    await frame.getByRole("button", { name: "Continue" }).click();
    assert.equal(
      await frame.locator("body").getAttribute("data-clicked"),
      "yes",
    );
    const result = await page.locator("iframe").evaluate((f) => ({
      height: f.clientHeight,
      content: f.contentDocument.documentElement.scrollHeight,
      innerScroll: f.contentWindow.scrollY,
    }));
    assert.equal(result.innerScroll, 0, "The host page owns scrolling");
    receipts.push({ width, ...result });
    await page.goto(`${base}/rush/borderrot/`);
    await page
      .frameLocator('iframe[title="borderrot"]')
      .locator("#quiz input")
      .waitFor();
    await page.waitForFunction(() => {
      const f = document.querySelector('iframe[title="borderrot"]');
      return (
        f.contentDocument.documentElement.scrollHeight <= f.clientHeight + 1
      );
    });
    await page.screenshot({
      path: `test-results/frame-size/${engine.name()}-${width}-borders.png`,
    });
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `test-results/frame-size/${engine.name()}.json`,
    JSON.stringify(receipts, null, 2),
  );
}
console.log(
  "Frame sizing settles after viewport-dependent overflow changes, without clipping the action.",
);
