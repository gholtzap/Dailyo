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
const assets = [];
const decodes = [];
async function eachLimit(items, limit, callback) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await callback(items[index], index);
      }
    }),
  );
}
const directory =
  process.env.PRODUCT_IMAGE_REPORT_DIR ?? "test-results/product-images";
await fs.mkdir(directory, { recursive: true });
try {
  const response = await fetch(`${base}/games/data/pricerot.json`);
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.ok(rows.length >= 2000, `Only ${rows.length} grocery products`);
  const bundledRows = JSON.parse(
    await fs.readFile(
      new URL("../dist/games/data/pricerot.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    rows,
    bundledRows,
    "The live catalog must match the verified release",
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  await eachLimit(rows, 4, async (row, index) => {
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
    assets.push({
      id: row.id,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if ((index + 1) % 250 === 0)
      console.log(`Verified ${index + 1}/${rows.length} live image files`);
  });
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({ viewport, colorScheme: "light" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/daily-score", (route) =>
      route.fulfill({ status: 404 }),
    );
    const inspect = async (state, surface = page) => {
      const text = await surface.locator("body").innerText();
      assert.doesNotMatch(
        text,
        /original (product )?illustration|product illustration|United States · USD|Guess the listed|Closer guesses|Within 20% counts|Your price in US dollars|Recorded price:|Recorded catalog price|Prices and availability|Rush tolerance|puzzles completed|Check the exact package|Five products per set|Your score rewards accuracy/i,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const checked =
        surface === page
          ? page
          : await (
              await page
                .locator("iframe:not(.feed-loading):not([hidden])")
                .elementHandle()
            ).contentFrame();
      reports.push({
        width: viewport.width,
        state,
        text,
        ...(await checkPage(checked, policy)),
      });
    };
    const ready = async (surface) => {
      await surface.getByLabel("Your guess").waitFor();
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
    const decoded = await page.evaluate(async (rows) => {
      const results = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (next < rows.length) {
            const row = rows[next++];
            const image = new Image();
            image.src = row.image;
            await image.decode();
            results.push({
              id: row.id,
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
            image.removeAttribute("src");
          }
        }),
      );
      return results;
    }, rows);
    assert.equal(decoded.length, rows.length);
    decodes.push({ width: viewport.width, images: decoded });
    assert.ok(
      decoded.every((image) => Math.min(image.width, image.height) >= 100),
    );
    await inspect("daily");
    assert.equal(
      await page.locator(".visual-note, .visual-figure figcaption").count(),
      0,
    );
    assert.equal(await page.locator(".price-currency").textContent(), "$");
    await page
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await inspect("help");
    assert.match(await page.getByRole("dialog").innerText(), /before tax/);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `${directory}/${viewport.width}-daily.png` });
    for (let index = 0; index < 5; index++) {
      await ready(page);
      const src = await page.locator("#quiz img").getAttribute("src");
      const row = rows.find((row) => row.image === src);
      assert.ok(row);
      await page.getByLabel("Your guess").fill(String(row.cents / 100));
      await page
        .getByRole("button", { name: "Check price", exact: true })
        .click();
      await page
        .locator("#visual-feedback")
        .filter({ hasText: "100 / 100 points" })
        .waitFor();
      assert.equal(
        await page.locator(".price-actual").textContent(),
        `$${(row.cents / 100).toFixed(2)}`,
      );
      assert.equal(await page.locator(".price-error").textContent(), "Exact");
      if (index === 0) {
        await inspect("answer");
        await page.screenshot({
          path: `${directory}/${viewport.width}-answer.png`,
        });
        assert.doesNotMatch(
          await page.locator("body").innerText(),
          /2026-11-17/,
        );
        await page.locator(".visual-source summary").click();
        await inspect("source");
        assert.equal(
          await page.locator(".visual-source time").getAttribute("datetime"),
          row.captured,
        );
        assert.equal(
          await page.locator(".visual-source a").first().getAttribute("href"),
          row.source,
        );
      }
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
      .locator(".visual-recap > li > details > summary")
      .first()
      .click();
    await inspect("review");
    await page.screenshot({
      path: `${directory}/${viewport.width}-review.png`,
    });
    await page
      .getByRole("button", { name: "Play practice", exact: true })
      .click();
    await ready(page);
    await inspect("practice");
    await page.getByLabel("Your guess").fill("0");
    await page.getByLabel("Your guess").press("Enter");
    await inspect("practice-answer");
    assert.equal(await page.locator(".price-error").textContent(), "100% low");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByRole("button", { name: "Show answer", exact: true })
      .click();
    await inspect("revealed");
    assert.equal(await page.locator(".price-comparison > div").count(), 1);
    await page.goto(`${base}/rush/pricerot/`);
    const frame = page.frameLocator("iframe:not(.feed-loading):not([hidden])");
    await ready(frame);
    await inspect("rush-prompt", frame);
    await frame
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    assert.match(await frame.getByRole("dialog").innerText(), /within 20%/i);
    await inspect("rush-help", frame);
    await frame.getByRole("button", { name: "Close", exact: true }).click();
    await frame.getByLabel("Your guess").fill("1000");
    await frame.getByLabel("Your guess").press("Enter");
    await page
      .getByRole("button", { name: "Keep answer", exact: true })
      .click();
    await frame.getByRole("heading", { name: "Missed", exact: true }).waitFor();
    await inspect("rush-answer", frame);
    assert.match(await frame.locator(".price-error").textContent(), /% high/);
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
      `${viewport.width}px: all ${rows.length} photos decode; Daily, answers, results, Practice, Rush, failed-image hiding and recovery passed`,
    );
  }
} finally {
  await fs.writeFile(
    `${directory}/report.json`,
    JSON.stringify(
      {
        base,
        assets: assets.sort((a, b) => a.id.localeCompare(b.id)),
        decodes,
        reports,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
const findings = reports.flatMap((report) => report.findings);
console.log(
  `${reports.length} UI states checked; ${findings.length} findings. Report: ${directory}/report.json`,
);
if (findings.length) process.exitCode = 1;
