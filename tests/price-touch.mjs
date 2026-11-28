import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { setPrice } from "./input-helpers.mjs";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4189";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
const out = "test-results/price-touch";
await fs.mkdir(out, { recursive: true });
const receipts = [];
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: true,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/pricerot/`);
    const dollars = page.getByRole("spinbutton", {
      name: "Dollars",
      exact: true,
    });
    await dollars.waitFor();
    await page.evaluate(() => {
      window.trustedTouches = 0;
      document.addEventListener("touchstart", (e) => {
        if (e.isTrusted) window.trustedTouches++;
      });
    });
    const settle = async () => {
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".price-wheel")].every((e) => {
          const row = e.querySelector(".price-option.is-selected");
          if (!row || e.getAttribute("aria-busy") === "true") return false;
          const r = row.getBoundingClientRect(),
            w = e.getBoundingClientRect();
          return Math.abs((r.top + r.bottom - w.top - w.bottom) / 2) < 1;
        }),
      );
    };
    const read = () => page.locator("#price-value").textContent();
    await setPrice(page, 3.49);
    await settle();
    let box = await dollars.boundingBox();
    // These are trusted browser touch events, not page.mouse or synthetic DOM events.
    for (const fraction of [0.5, 0.99, 0.01, 0.9]) {
      await page.touchscreen.tap(
        box.x + box.width * fraction,
        box.y + box.height / 2,
      );
      assert.equal(
        await read(),
        "$3.49",
        `Horizontal position ${fraction} must not map to a $0–$10,000 range`,
      );
      assert.equal(
        await dollars.evaluate((e) => getComputedStyle(e).outlineStyle),
        "none",
        "Touch must not add the keyboard outline",
      );
    }
    assert.equal(await page.evaluate(() => window.trustedTouches), 4);
    // A neighboring row is a one-step selection, regardless of horizontal position.
    await page.touchscreen.tap(
      box.x + box.width * 0.9,
      box.y + box.height - 10,
    );
    await page.waitForFunction(
      () => document.querySelector("#price-value").textContent === "$4.49",
    );
    await settle();
    await page.touchscreen.tap(box.x + box.width * 0.1, box.y + 10);
    await page.waitForFunction(
      () => document.querySelector("#price-value").textContent === "$3.49",
    );
    await settle();
    if (engine === chromium) {
      const session = await page.context().newCDPSession(page);
      if (process.argv.includes("--cpu-slow"))
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const point = (y) => [{ x: box.x + box.width * 0.9, y }];
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: point(box.y + 80),
      });
      for (let i = 1; i <= 6; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: point(box.y + 80 - i * 10),
        });
        await page.waitForTimeout(25);
        // Glyphs crossing the viewport must remain present and retain their
        // layout size. Emphasis may transform continuously, never swap fonts.
        const painted = await dollars.evaluate((wheel) => {
          const bounds = wheel.getBoundingClientRect();
          return [...wheel.querySelectorAll(".price-digit")]
            .filter((digit) => {
              const r = digit.getBoundingClientRect();
              return r.bottom > bounds.top + 2 && r.top < bounds.bottom - 2;
            })
            .map((digit) => ({
              visibility: getComputedStyle(digit).visibility,
              size: getComputedStyle(digit).fontSize,
            }));
        });
        assert.ok(painted.length >= 3);
        for (const digit of painted) {
          assert.equal(digit.visibility, "visible", "No blank approaching row");
          assert.equal(digit.size, "24px", "No font-size jump during a pan");
        }
      }
      // Reverse before release. The same finger movement must move the actual scroll position back.
      const up = await dollars.evaluate((e) => e.scrollTop);
      for (let i = 1; i <= 5; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: point(box.y + 20 + i * 10),
        });
        await page.waitForTimeout(25);
      }
      const down = await dollars.evaluate((e) => e.scrollTop);
      assert.ok(
        down < up,
        `Reversing a touch must reverse scroll: ${up} -> ${down}`,
      );
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await settle();
      const n = Number(await dollars.getAttribute("aria-valuenow"));
      assert.ok(
        n >= 0 && n < 100,
        `A short swipe must stay near the price, got ${n}`,
      );
      await setPrice(page, 3.49);
      await settle();
      const flickTime = Date.now() / 1000;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        timestamp: flickTime,
        touchPoints: point(box.y + 110),
      });
      for (let i = 1; i <= 6; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: point(box.y + 110 - i * 12),
          timestamp: flickTime + i * 0.01,
        });
        await page.waitForTimeout(10);
      }
      const release = await dollars.evaluate((e) => e.scrollTop);
      await session.send("Input.dispatchTouchEvent", {
        timestamp: flickTime + 0.07,
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(80);
      const coast = await dollars.evaluate((e) => e.scrollTop);
      assert.ok(
        coast > release,
        "A flick continues scrolling after finger release",
      );
      await settle();
      receipts.push({
        viewport,
        gesture: "trusted touch flick",
        release,
        coast,
        selected: await dollars.getAttribute("aria-valuenow"),
      });
      await setPrice(page, 50);
      await settle();
      const firstRow = await dollars
        .locator(".price-option")
        .first()
        .textContent();
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: point(box.y + 110),
      });
      for (let i = 1; i <= 6; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: point(box.y + 110 - i * 8),
        });
        await page.waitForTimeout(25);
      }
      await page.waitForTimeout(250);
      assert.equal(
        await dollars.locator(".price-option").first().textContent(),
        firstRow,
        "Holding a finger must keep the scroll rows stable",
      );
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await settle();
      await setPrice(page, 100);
      await settle();
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: point(box.y + 20),
      });
      for (let i = 1; i <= 6; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: point(box.y + 20 + i * 10),
        });
        await page.waitForTimeout(25);
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await settle();
      assert.ok(
        Number(await dollars.getAttribute("aria-valuenow")) < 100,
        "A downward touch swipe leaves the maximum",
      );
      receipts.push({
        viewport,
        gesture: "trusted touch swipe and reversal",
        up,
        down,
        selected: n,
      });
    } else {
      // Playwright exposes trusted taps but no WebKit touch-drag API. Wheel input
      // exercises WebKit's native scroll/snap path without synthetic touch claims.
      const wheelPage = await browser.newPage({ viewport });
      await wheelPage.goto(`${base}/pricerot/`);
      const wheel = wheelPage.getByRole("spinbutton", {
        name: "Dollars",
        exact: true,
      });
      await wheel.waitFor();
      await wheel.hover();
      await wheelPage.mouse.wheel(0, 96);
      await wheelPage.waitForTimeout(350);
      assert.ok(
        Number(await wheel.getAttribute("aria-valuenow")) > 0 &&
          Number(await wheel.getAttribute("aria-valuenow")) < 100,
      );
      await wheelPage.close();
      receipts.push({
        viewport,
        gesture: "trusted WebKit taps and native wheel scrolling",
      });
    }
    // Recover from both bounds and ordinary prices.
    for (const amount of [100, 0, 50, 98]) {
      await setPrice(page, amount);
      await settle();
      const before = Number(await dollars.getAttribute("aria-valuenow"));
      const bounds = await dollars.boundingBox();
      await page.touchscreen.tap(
        bounds.x + bounds.width * 0.9,
        amount === 0 ? bounds.y + bounds.height - 10 : bounds.y + 10,
      );
      await settle();
      assert.equal(
        Number(await dollars.getAttribute("aria-valuenow")),
        before + (amount === 0 ? 1 : -1),
      );
    }
    await setPrice(page, 3.49);
    await settle();
    await page.keyboard.press("Tab");
    await dollars.focus();
    await dollars.press("ArrowUp");
    assert.equal(
      await dollars.evaluate((e) => getComputedStyle(e).outlineStyle),
      "solid",
      "Keyboard focus remains visible",
    );
    box = await dollars.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(
      await dollars.evaluate((e) => getComputedStyle(e).outlineStyle),
      "none",
      "Returning to touch clears keyboard focus decoration",
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `${out}/${engine.name()}-${viewport.width}.png`,
      fullPage: true,
    });
    await page.close();
  }
  // Desktop dragging must follow sub-row movements, rather than re-snapping
  // each scrollTop assignment. Inspect real rendered transforms throughout.
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await desktop.goto(`${base}/pricerot/`);
  await setPrice(desktop, 23.49);
  const wheel = desktop.locator("#price-dollars");
  await desktop.waitForFunction(
    () =>
      document.querySelector("#price-dollars").getAttribute("aria-busy") ===
      "false",
  );
  const bounds = await wheel.boundingBox();
  const start = await wheel.evaluate((e) => e.scrollTop);
  await desktop.mouse.move(bounds.x + bounds.width / 2, bounds.y + 110);
  await desktop.mouse.down();
  const frames = [];
  for (let i = 1; i <= 8; i++) {
    await desktop.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + 110 - i * 6,
    );
    await desktop.evaluate(() => new Promise(requestAnimationFrame));
    const frame = await wheel.evaluate((e) => ({
      top: e.scrollTop,
      transform: getComputedStyle(e.children[24].firstElementChild).transform,
    }));
    assert.ok(Math.abs(frame.top - start - i * 6) < 1, JSON.stringify(frame));
    frames.push(frame);
  }
  await desktop.mouse.up();
  const timeline = await desktop.evaluate(() =>
    CSS.supports("animation-timeline: view()"),
  );
  if (timeline)
    assert.ok(
      new Set(frames.map((f) => f.transform)).size >= 6,
      "Emphasis tracks scroll continuously",
    );
  await desktop.waitForFunction(
    () =>
      document.querySelector("#price-dollars").getAttribute("aria-busy") ===
      "false",
  );
  assert.equal(await wheel.getAttribute("aria-valuenow"), "24");
  await desktop.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await wheel
      .locator(".price-option.is-selected .price-digit")
      .evaluate((e) => getComputedStyle(e).transform),
    "none",
  );
  receipts.push({
    gesture: "desktop sub-row drag",
    timeline,
    frames,
    reducedMotion: "no scaling",
  });
  await desktop.close();
} finally {
  await browser.close();
  await fs.writeFile(
    `${out}/${engine.name()}.json`,
    JSON.stringify({ base, receipts }, null, 2),
  );
}
console.log(
  `${engine.name()}: trusted touch taps, neighboring rows, native scrolling, bounds, stable rows and keyboard focus passed`,
);
