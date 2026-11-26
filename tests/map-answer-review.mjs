import { distanceKm } from "../dist/games/rot-puzzles.js";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
const lint = process.argv.includes("--ui");
const raw = JSON.parse(
  await fs.readFile("dist/games/data/maprot.json", "utf8"),
);
const borders = JSON.parse(
  await fs.readFile("dist/games/data/border-map.json", "utf8"),
);
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch(),
  receipts = [];
await fs.mkdir("test-results/map-answer-review", { recursive: true });
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: viewport.width === 390,
      colorScheme: "dark",
    });
    await page.route("**/games/data/maprot.json", (route) =>
      route.fulfill({
        json: {
          ...raw,
          places: Array.from({ length: 5 }, () => [
            "Shanghai",
            "China",
            121.47,
            31.23,
          ]),
        },
      }),
    );
    await page.goto(`${base}/rush/maprot/`);
    await page.locator("#rush-status").filter({ hasText: "Round 1" }).waitFor();
    const f = page.frameLocator("iframe[title=maprot]"),
      map = f.locator(".rot-map");
    const point = await map.evaluate((svg) => {
      const p = new DOMPoint(114.9 + 180, 90 - 26.4).matrixTransform(
          svg.getScreenCTM(),
        ),
        r = svg.getBoundingClientRect();
      return { x: p.x - r.x, y: p.y - r.y };
    });
    await map.click({ position: point });
    await f.getByRole("button", { name: "Check pin", exact: true }).click();
    await page.locator("#rush-status").filter({ hasText: "Missed" }).waitFor();
    await page
      .getByRole("button", { name: "Keep answer", exact: true })
      .click();
    await f
      .getByRole("button", { name: "Zoom in", exact: true })
      .waitFor({ timeout: 2000 });
    const contours = await map
      .locator(".rot-distance-ring")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          distance: Number(n.getAttribute("data-distance-km")),
          path: n.getAttribute("d"),
        })),
      );
    assert.equal(contours.length, 3);
    for (const contour of contours) {
      const points = [...contour.path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
      for (const point of points.filter((_, i) => i % 60 === 0))
        assert.ok(
          Math.abs(
            distanceKm(
              [121.47, 31.23],
              [Number(point[1]) - 180, 90 - Number(point[2])],
            ) - contour.distance,
          ) < 2,
          "Each contour must represent a constant geographic distance, rather than circles in map coordinates",
        );
    }
    const before = await map.getAttribute("viewBox"),
      feedback = await f.locator(".rot-feedback").innerText();
    await f.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.notEqual(await map.getAttribute("viewBox"), before);
    await f.getByRole("button", { name: "Zoom out", exact: true }).click();
    assert.equal(
      await f.locator(".rot-feedback").innerText(),
      feedback,
      "Map navigation cannot change the submitted guess",
    );
    assert.ok((await f.locator(".rot-country-outline").count()) > 100);
    const firstPoint = (path) =>
      path
        .match(/^M(-?[\d.]+),(-?[\d.]+)/)
        .slice(1)
        .map(Number);
    const [longitude, mercatorY] = firstPoint(borders.paths[0][1]);
    const latitudeY = Number(
      (
        (Math.atan(Math.sinh((mercatorY * Math.PI) / 180)) * 180) /
        Math.PI
      ).toFixed(4),
    );
    assert.deepEqual(
      firstPoint(
        await f.locator(".rot-country-outline").first().getAttribute("d"),
      ),
      [longitude, latitudeY],
      "Prepared borders must use the city map latitude grid",
    );
    await f
      .locator(".rot-city-label")
      .filter({ hasText: "Shanghai" })
      .waitFor();
    await f.getByRole("button", { name: "Enlarge map", exact: true }).click();
    await f.getByRole("dialog", { name: "Map answer", exact: true }).waitFor();
    const frame = await (
      await page.locator("iframe[title=maprot]").elementHandle()
    ).contentFrame();
    const pins = await map
      .locator(".rot-pin")
      .evaluateAll((nodes) =>
        nodes.map((n) => [n.getAttribute("cx"), n.getAttribute("cy")]),
      );
    const box = await map.boundingBox(),
      beforePan = await map.getAttribute("viewBox");
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.3, {
      steps: 4,
    });
    await page.mouse.up();
    assert.notEqual(
      await map.getAttribute("viewBox"),
      beforePan,
      "Answer maps must pan",
    );
    await map.press("ArrowRight");
    const keyboardWidth = await map.evaluate(
      (svg) => svg.viewBox.baseVal.width,
    );
    await map.press("=");
    assert.ok(
      await map.evaluate(
        (svg, w) => svg.viewBox.baseVal.width < w,
        keyboardWidth,
      ),
    );
    await map.press("-");
    assert.equal(
      await map.evaluate((svg) => {
        const event = new KeyboardEvent("keydown", {
          key: "+",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        svg.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
      "Map controls must preserve browser zoom shortcuts",
    );
    if (viewport.width === 390) {
      const cdp = await page.context().newCDPSession(page),
        x = box.x + box.width * 0.5,
        y = box.y + box.height * 0.5;
      const beforePinch = await map.evaluate(
        (svg) => svg.viewBox.baseVal.width,
      );
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: x - 20, y, id: 0 },
          { x: x + 20, y, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: x - 40, y, id: 0 },
          { x: x + 40, y, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert.ok(
        await map.evaluate(
          (svg, w) => svg.viewBox.baseVal.width < w * 0.8,
          beforePinch,
        ),
        "Answer maps must support pinch zoom",
      );
    }
    assert.deepEqual(
      await map
        .locator(".rot-pin")
        .evaluateAll((nodes) =>
          nodes.map((n) => [n.getAttribute("cx"), n.getAttribute("cy")]),
        ),
      pins,
      "Exploration cannot alter either submitted pin",
    );
    await f.getByRole("button", { name: "Fit answer", exact: true }).click();
    const report = await checkPage(frame, policy);
    await page.screenshot({
      path: `test-results/map-answer-review/${viewport.width}-review.png`,
    });
    const manualContrast = await frame.evaluate(() => {
      const linear = (c) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) =>
        0.2126 * linear(rgb[0]) +
        0.7152 * linear(rgb[1]) +
        0.0722 * linear(rgb[2]);
      const rgb = (value) => value.match(/[\d.]+/g)?.map(Number);
      return [
        ...document.querySelectorAll(
          ".rot-map-dialog[open] .rot-map-dialog-heading h2, .rot-map-dialog[open] button, .rot-map-dialog[open] .rot-feedback p, .rot-map-dialog[open] .rot-city-label",
        ),
      ].map((node) => {
        let backgroundNode = node,
          background;
        while (backgroundNode) {
          const c = rgb(getComputedStyle(backgroundNode).backgroundColor);
          if (c?.length === 3 || c?.[3] === 1) {
            background = c;
            break;
          }
          backgroundNode = backgroundNode.parentElement;
        }
        const foreground = rgb(getComputedStyle(node).color);
        const a = luminance(foreground),
          b = luminance(background);
        return {
          text: node.textContent,
          foreground,
          background,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
    });
    assert.ok(
      manualContrast.length >= 5 &&
        manualContrast.every((check) => check.ratio >= 4.5),
      "Opaque map answer text must meet WCAG AA contrast",
    );
    assert.deepEqual(
      report.findings.filter((f) => f.status !== "unresolved"),
      [],
      "No definite UI policy failures",
    );
    if (lint && report.findings.length) process.exitCode = 1;
    await f.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(
      await f
        .getByRole("button", { name: "Enlarge map", exact: true })
        .evaluate((node) => node === document.activeElement),
      true,
    );
    receipts.push({
      viewport,
      feedback,
      manualContrast,
      auditStatus: report.findings.length ? "incomplete" : "passed",
      report,
    });
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/map-answer-review/results.json",
    JSON.stringify(receipts, null, 2),
  );
}

console.log(
  "Map answer: zoom, pan, pinch, keyboard, fixed pins, focus return, borders and projection passed; automatic contrast findings remain marked incomplete where unresolved.",
);
