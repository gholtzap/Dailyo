import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import { makeSet, preparePuzzles } from "../dist/games/rot-puzzles.js";
import { rushSeed } from "./rush-helpers.mjs";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const policy = JSON.parse(
  await fs.readFile(new URL("../ui-policy.json", import.meta.url)),
);
const browser = await chromium.launch(),
  reports = [],
  lint = process.argv.includes("--ui");
await fs.mkdir("test-results/maprot-precision", { recursive: true });
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({
      viewport,
      colorScheme: "dark",
      hasTouch: viewport.width === 390,
      isMobile: viewport.width === 390,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date("2026-11-20T16:00:00Z"));
    const resources = [];
    page.on("request", (request) =>
      resources.push(new URL(request.url()).pathname),
    );
    await page.goto(`${base}/maprot/`);
    const map = page.locator(".rot-picking"),
      pin = page.locator(".rot-coordinate");
    await map.waitFor();
    assert.ok(resources.includes("/games/data/map-geometry.json"));
    assert.ok(
      !resources.includes("/games/data/border-map.json"),
      "Maprot must use prepared geometry",
    );
    assert.ok(
      !resources.includes("/games/data/borderrot.json"),
      "Country labels must arrive with geometry",
    );
    assert.ok(
      (await page.locator(".rot-country-outline").count()) > 100,
      "Country outlines must render",
    );
    const inspect = async (state) => {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `test-results/maprot-precision/${viewport.width}-${state}.png`,
      });
      if (lint)
        reports.push({ viewport, state, ...(await checkPage(page, policy)) });
    };
    await page
      .getByRole("button", { name: "Enlarge map", exact: true })
      .waitFor({ timeout: 3000 });
    await inspect("inline");
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    await map.press("ArrowRight");
    await map.press("Shift+ArrowUp");
    assert.match(await pin.innerText(), /0.10° N, 1.00° E/);
    const selected = await pin.innerText();
    await page.reload();
    await map.waitFor();
    assert.equal(await pin.innerText(), selected);
    const inlineHeight = (await map.boundingBox()).height;
    await page
      .getByRole("button", { name: "Enlarge map", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Find the city" });
    await dialog.waitFor();
    assert.ok((await map.boundingBox()).height > inlineHeight);
    const width = await map.evaluate((e) => e.viewBox.baseVal.width);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.ok(await map.evaluate((e, w) => e.viewBox.baseVal.width < w, width));
    assert.equal(await pin.innerText(), selected, "Zoom must not move the pin");
    await inspect("enlarged");
    await page.screenshot({
      path: `test-results/maprot-precision/${viewport.width}-enlarged.png`,
    });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Enlarge map", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    assert.equal(await pin.innerText(), selected);

    await page
      .getByRole("button", { name: "Enlarge map", exact: true })
      .click();
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    const data = preparePuzzles(
      "maprot",
      await (await page.request.get(`${base}/games/data/maprot.json`)).json(),
    );
    const [city, , lon, lat] = makeSet("maprot", data, "2026-11-20")[0];
    const point = await map.evaluate(
      (svg, [lon, lat]) => {
        const p = new DOMPoint(lon + 180, 90 - lat).matrixTransform(
          svg.getScreenCTM(),
        );
        return { x: p.x, y: p.y };
      },
      [lon, lat],
    );
    if (viewport.width === 390) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const beforePan = await map.getAttribute("viewBox"),
      beforePin = await pin.innerText(),
      box = await map.boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.25, {
      steps: 5,
    });
    await page.mouse.up();
    assert.notEqual(
      await map.getAttribute("viewBox"),
      beforePan,
      "Drag must pan the zoomed map",
    );
    assert.equal(
      await pin.innerText(),
      beforePin,
      "Panning must not submit or move the pin",
    );
    const marker = await page.locator(".rot-pin.guess").evaluate((e) => {
      const p = new DOMPoint(
        Number(e.getAttribute("cx")),
        Number(e.getAttribute("cy")),
      ).matrixTransform(e.getScreenCTM());
      return { x: p.x, y: p.y };
    });
    await page.mouse.move(marker.x, marker.y);
    await page.mouse.down();
    await page.mouse.move(marker.x + 16, marker.y - 12, { steps: 4 });
    await page.mouse.up();
    assert.notEqual(
      await pin.innerText(),
      beforePin,
      "Dragging the pin must adjust the guess",
    );
    await page.mouse.move(marker.x + 16, marker.y - 12);
    await page.mouse.down();
    await page.mouse.move(marker.x, marker.y, { steps: 4 });
    await page.mouse.up();
    const restoredPin = await pin.innerText();
    if (viewport.width === 390) {
      const cdp = await page.context().newCDPSession(page),
        x = box.x + box.width * 0.5,
        y = box.y + box.height * 0.5;
      const initialWidth = await map.evaluate((e) => e.viewBox.baseVal.width);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: x - 25, y, id: 0 },
          { x: x + 25, y, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: x - 50, y, id: 0 },
          { x: x + 50, y, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      assert.ok(
        await map.evaluate(
          (e, w) => e.viewBox.baseVal.width < w * 0.8,
          initialWidth,
        ),
        "Pinch must zoom",
      );
      assert.equal(await pin.innerText(), restoredPin);
    }
    await page.getByRole("button", { name: "Check pin", exact: true }).click();
    await page.locator(".rot-connector").waitFor();
    assert.match(
      await page.locator(".rot-feedback").innerText(),
      new RegExp(city),
    );
    assert.ok(
      parseInt(await page.locator(".rot-feedback").innerText(), 10) < 50,
      "An exact map click must stay precise through pan and zoom",
    );
    assert.equal(await page.locator(".rot-map-dialog[open]").count(), 0);
    await inspect("result");

    await page.goto(`${base}/rush/maprot/`);
    const status = page.locator("#rush-status");
    await status.filter({ hasText: "Round 1" }).waitFor();
    const child = page.frameLocator("iframe[title=maprot]");
    const q = makeSet("maprot", data, await rushSeed(page, "maprot"), 0)[0];
    await child
      .getByRole("button", { name: "Reset view", exact: true })
      .click();
    const position = await child.locator(".rot-picking").evaluate((svg, q) => {
      const p = new DOMPoint(q[2] + 180, 90 - q[3]).matrixTransform(
          svg.getScreenCTM(),
        ),
        r = svg.getBoundingClientRect();
      return { x: p.x - r.left, y: p.y - r.top };
    }, q);
    await child.locator(".rot-picking").click({ position });
    await child.getByRole("button", { name: "Check pin", exact: true }).click();
    await status.filter({ hasText: "Round 2" }).waitFor();
    await child
      .getByRole("button", { name: "Enlarge map", exact: true })
      .click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await status.filter({ hasText: "Paused" }).waitFor();
    assert.equal(await child.locator(".rot-map-dialog").isVisible(), false);
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    assert.equal(await child.locator(".rot-map-dialog").isVisible(), true);
    await child.getByRole("button", { name: "Close", exact: true }).click();
    await child
      .getByRole("button", { name: "Enlarge map", exact: true })
      .click();
    // Exercise the trusted host timeout message while the timed map is enlarged.
    await page
      .locator('iframe[title="maprot"]')
      .evaluate((frame) =>
        frame.contentWindow.postMessage("rush-timeout", location.origin),
      );
    await child.locator(".rot-reviewing").waitFor();
    await page.waitForFunction(
      () => !document.querySelector("iframe.feed-map-expanded"),
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${viewport.width}px: enlarge, keyboard precision, restore pin, zoom, pan, pinch, close/focus, and precise submission`,
    );
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/maprot-precision/ui.json",
    JSON.stringify(reports, null, 2),
  );
}
if (reports.some((r) => r.findings.length)) process.exitCode = 1;
