import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { checkPage } from "lintapple";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(
  await fs.readFile(new URL("../ui-policy.json", import.meta.url)),
);
const browser = await chromium.launch();
const reports = [];
const directory =
  process.env.PRODUCT_IMAGE_REPORT_DIR ?? "test-results/product-images";
await fs.mkdir(directory, { recursive: true });
try {
  const response = await fetch(`${base}/games/data/pricerot.json`);
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 12);
  for (const row of rows) {
    assert.match(row.image, /^\/games\/media\/price-[\w-]+\.webp$/);
    assert.match(row.imageSource, /^https:\/\//);
    const response = await fetch(new URL(row.image, base));
    assert.equal(response.status, 200, row.id);
    assert.match(response.headers.get("content-type"), /image\/webp/);
    const bytes = Buffer.from(await response.arrayBuffer());
    const bundled = await fs.readFile(
      new URL(`../dist${row.image}`, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      createHash("sha256").update(bundled).digest("hex"),
      `${row.id}: live image differs from verified asset`,
    );
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  }
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({ viewport, colorScheme: "light" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/daily-score", (route) =>
      route.fulfill({ status: 404 }),
    );
    const inspect = async (state) => {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      reports.push({
        width: viewport.width,
        state,
        ...(await checkPage(page, policy)),
      });
    };
    const ready = async (surface) => {
      await surface.getByLabel("Your price in US dollars").waitFor();
      assert.ok(
        await surface.locator("#quiz img").evaluate(async (img) => {
          await img.decode();
          return img.naturalWidth >= 100 && !img.src.endsWith(".svg");
        }),
      );
    };
    await page.goto(`${base}/pricerot/`);
    await ready(page);
    // Decode every shipped photograph in a real browser, not only today's five.
    const decoded = await page.evaluate(
      async (rows) =>
        Promise.all(
          rows.map(async (row) => {
            const image = new Image();
            image.src = row.image;
            await image.decode();
            return {
              id: row.id,
              width: image.naturalWidth,
              height: image.naturalHeight,
            };
          }),
        ),
      rows,
    );
    assert.equal(decoded.length, 12);
    assert.ok(
      decoded.every((image) => Math.min(image.width, image.height) >= 100),
    );
    await inspect("daily");
    await page.screenshot({ path: `${directory}/${viewport.width}-daily.png` });
    for (let index = 0; index < 5; index++) {
      await ready(page);
      const src = await page.locator("#quiz img").getAttribute("src");
      const row = rows.find((row) => row.image === src);
      assert.ok(row);
      await page
        .getByLabel("Your price in US dollars")
        .fill(String(row.cents / 100));
      await page
        .getByRole("button", { name: "Check price", exact: true })
        .click();
      await page
        .locator("#visual-feedback")
        .filter({ hasText: "100 / 100 points" })
        .waitFor();
      if (index === 0) await inspect("answer");
      await page
        .getByRole("button", {
          name: index === 4 ? "See results" : "Next",
          exact: true,
        })
        .click();
    }
    await page
      .getByRole("heading", { name: "500 / 500 points", exact: true })
      .waitFor();
    await inspect("results");
    await page
      .getByRole("button", { name: "Play practice", exact: true })
      .click();
    await ready(page);
    await inspect("practice");
    await page.goto(`${base}/rush/pricerot/`);
    const frame = page.frameLocator("iframe:not(.feed-loading):not([hidden])");
    await ready(frame);
    assert.ok(rows.some((row) => row.image === undefined) === false);
    await page.goto(`${base}/pricerot/`);
    await ready(page);
    await page.route("**/games/media/price-*.webp", (route) =>
      route.fulfill({ status: 503 }),
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Reload puzzle", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("#quiz img, #question-title, #quiz input").count(),
      0,
      "A missing photo must hide the product and guess form",
    );
    await inspect("image-error");
    await page.unroute("**/games/media/price-*.webp");
    await page
      .getByRole("button", { name: "Reload puzzle", exact: true })
      .click();
    await ready(page);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${viewport.width}px: all 12 photos decode; Daily, answers, results, Practice, Rush, failed-image hiding and recovery passed`,
    );
  }
} finally {
  await fs.writeFile(
    `${directory}/report.json`,
    JSON.stringify({ base, reports }, null, 2),
  );
  await browser.close();
}
const findings = reports.flatMap((report) => report.findings);
console.log(
  `${reports.length} UI states checked; ${findings.length} findings. Report: ${directory}/report.json`,
);
if (findings.length) process.exitCode = 1;
