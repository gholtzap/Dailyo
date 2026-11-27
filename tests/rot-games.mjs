import { assertEditorialUI } from "./editorial-helpers.mjs";
import { gameName } from "../dist/game-names.js";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
import {
  distanceKm,
  makeSet,
  preparePuzzles,
} from "../dist/games/rot-puzzles.js";

const read = async (path) =>
  JSON.parse(await fs.readFile(new URL(path, import.meta.url), "utf8"));
const policy = await read("../ui-policy.json");
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const ui = process.argv.includes("--ui");
const day = "2026-11-28";
const reports = [];
const browser = await chromium.launch();
const dayTime = new Date(`${day}T16:00:00Z`);

assert.equal(distanceKm([0, 0], [0, 0]), 0);
assert.equal(
  distanceKm([-179, 0], [179, 0]),
  222,
  "Use the short arc across the date line",
);

async function answerMap(page, [city, , lon, lat], index) {
  const map = page.locator(".rot-map");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  if (index === 0) {
    await map.press("ArrowRight");
    await map.press("Shift+ArrowUp");
    assert.match(
      await page.locator(".rot-coordinate").textContent(),
      /0.10° N, 1.00° E/,
    );
    await page.reload();
    await map.waitFor();
    assert.match(
      await page.locator(".rot-coordinate").textContent(),
      /0.10° N, 1.00° E/,
    );
  }
  await map.scrollIntoViewIfNeeded();
  const { x, y } = await map.evaluate(
    (svg, [lon, lat]) => {
      const p = new DOMPoint(lon + 180, 90 - lat).matrixTransform(
        svg.getScreenCTM(),
      );
      return { x: p.x, y: p.y };
    },
    [lon, lat],
  );
  if (page.viewportSize().width < 700) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.getByRole("button", { name: "Check pin", exact: true }).click();
  await checkMapResult(map, 20);
  const feedback = await page.locator(".rot-feedback").innerText();
  assert.ok(parseInt(feedback, 10) < 250, feedback);
  assert.ok(feedback.includes(city));
}

async function checkMapResult(map, maxWidth) {
  const { width, height, lineLength, visible, dotted } = await map.evaluate(
    (node) => {
      const { x, y, width, height } = node.viewBox.baseVal;
      const line = node.querySelector(".rot-connector");
      const pins = [...node.querySelectorAll(".rot-pin")].map((pin) =>
        ["cx", "cy", "r"].map((attr) => Number(pin.getAttribute(attr))),
      );
      return {
        width,
        height,
        lineLength: line?.getTotalLength(),
        dotted: line && getComputedStyle(line).strokeDasharray !== "none",
        visible:
          pins.length === 2 &&
          pins.every(
            ([cx, cy, r]) =>
              cx - r >= x &&
              cx + r <= x + width &&
              cy - r >= y &&
              cy + r <= y + height,
          ),
      };
    },
  );
  assert.ok(width > 0 && width <= maxWidth && height > 0);
  assert.ok(
    visible && dotted && lineLength <= width,
    "Draw a dotted line with both pins inside the zoomed map",
  );
}

async function answerYear(page, { event, timeline }, index) {
  assert.equal(await page.locator("#round-title").innerText(), event[1]);
  assert.equal(await page.locator(".rot-year-event").innerText(), event[1]);
  const clues = page.getByRole("list", { name: "Timeline" });
  assert.deepEqual(
    (await clues.locator("time").allTextContents()).map(Number),
    timeline.map(([year]) => year),
  );
  const slots = page
    .getByRole("group", { name: "Choose when it happened" })
    .getByRole("button");
  assert.equal(await slots.count(), timeline.length + 1);
  const slot = timeline.filter(([year]) => year < event[0]).length;
  await slots
    .nth(index === 0 ? (slot + 1) % (timeline.length + 1) : slot)
    .press("Enter");
  assert.match(
    await page.locator(".rot-feedback").innerText(),
    index === 0 ? /Missed/ : /Correct/,
  );
  const years = (await page.locator(".rot-event time").allTextContents()).map(
    Number,
  );
  assert.deepEqual(
    years,
    [...years].sort((a, b) => a - b),
  );
  assert.equal(
    await page.locator(".highlight time").textContent(),
    String(event[0]),
  );
}

async function answerBorder(page, route, index, graph, inspect) {
  const map = page.locator(".border-map");
  await map.waitFor();
  assert.equal(await map.locator("[title]").count(), 0);
  assert.equal(await map.locator(".border-destination").count(), 1);
  const drawing = () =>
    map.locator("canvas").evaluate((canvas) => canvas.toDataURL());
  if (index === 4) {
    await page.getByRole("button", { name: "Show shortest route" }).click();
    assert.equal(
      await page
        .getByRole("list", { name: "Shortest route" })
        .locator("li")
        .count(),
      route.length,
    );
    assert.equal(await map.locator("[title]").count(), route.length - 1);
    return;
  }
  const search = page.getByRole("searchbox", { name: "Add a country" });
  async function add(id) {
    const { name } = graph.get(id);
    await search.fill(name.slice(0, -1));
    await page.getByRole("button", { name, exact: true }).click();
  }
  if (index === 0) {
    const wrong = [...graph.keys()].find(
      (id) =>
        !route.includes(id) && !graph.get(route[0]).neighbours.includes(id),
    );
    const initialDrawing = await drawing();
    await add(wrong);
    assert.equal(await drawing(), initialDrawing);
    assert.equal(await map.locator("[title]").count(), 0);
    assert.match(
      await page.locator(".rot-feedback").innerText(),
      /share a land border/,
    );
    assert.equal(
      await page
        .getByRole("list", { name: "Your route" })
        .locator("li")
        .count(),
      1,
    );
    await add(route[1]);
    assert.notEqual(await drawing(), initialDrawing);
    assert.equal(
      await map.locator(".border-map-label").innerText(),
      graph.get(route[1]).name,
    );
    await inspect("partial route");
    await page.reload();
    await search.waitFor();
    assert.equal(
      await map.locator(".border-map-label").innerText(),
      graph.get(route[1]).name,
    );
    assert.equal(
      await page
        .getByRole("list", { name: "Your route" })
        .locator("li")
        .count(),
      2,
    );
    await page.getByRole("button", { name: "Undo last country" }).click();
    assert.equal(await drawing(), initialDrawing);
    assert.equal(await map.locator("[title]").count(), 0);
    assert.equal(
      await page
        .getByRole("list", { name: "Your route" })
        .locator("li")
        .count(),
      1,
    );
  }
  for (const id of route.slice(1)) await add(id);
  assert.match(
    await page.locator(".rot-feedback").innerText(),
    /Shortest route/,
  );
  assert.equal(await map.locator(".border-destination").count(), 0);
  assert.equal(await map.locator("[title]").count(), route.length - 1);
  assert.deepEqual(
    await page
      .getByRole("list", { name: "Shortest route" })
      .locator("li")
      .allTextContents(),
    route.map((id) => graph.get(id).name),
  );
}

async function checkMainTerritories() {
  const page = await browser.newPage();
  await page.clock.setFixedTime(new Date("2027-01-16T16:00:00Z"));
  await page.goto(`${base}/borderrot/`);
  assert.match(await page.locator("#round-title").innerText(), /^Morocco to /);
  await page.getByRole("searchbox", { name: "Add a country" }).fill("Spain");
  await page.getByRole("button", { name: "Spain", exact: true }).click();
  assert.match(
    await page.locator(".rot-feedback").innerText(),
    /don’t share a land border/,
  );
  assert.deepEqual(
    await page
      .getByRole("list", { name: "Your route" })
      .locator("li")
      .allTextContents(),
    ["Morocco"],
  );
  await page.close();
}

const answer = {
  maprot: answerMap,
  yearrot: answerYear,
  borderrot: answerBorder,
};

const mapData = preparePuzzles(
  "maprot",
  await read("../dist/games/data/maprot.json"),
);
assert.equal(mapData.items.length, 1000);
assert.equal(
  new Set(mapData.items.map((row) => `${row[0]}:${row[1]}`)).size,
  1000,
);
assert.deepEqual(
  makeSet("maprot", mapData, "2026-11-27"),
  await read("./fixtures/issued-map-puzzle.json"),
);
// These historic seeds target named-city regressions in the preserved pool.

try {
  const astana = await browser.newPage();
  await astana.clock.setFixedTime(new Date("2020-03-29T16:00:00Z"));
  await astana.goto(`${base}/maprot/`);
  await astana.getByRole("button", { name: "Reset view", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await astana.locator(".rot-map").press("ArrowRight");
    await astana.getByRole("button", { name: "Check pin" }).click();
    await astana.getByRole("button", { name: "Next" }).click();
  }
  assert.equal(await astana.locator("#round-title").innerText(), "Find Astana");
  await astana.close();

  const suva = await browser.newPage();
  await suva.clock.setFixedTime(new Date("2020-01-17T16:00:00Z"));
  await suva.goto(`${base}/maprot/`);
  await suva.getByRole("button", { name: "Reset view", exact: true }).click();
  assert.equal(await suva.locator("#round-title").innerText(), "Find Suva");
  const map = suva.locator(".rot-map");
  await map.scrollIntoViewIfNeeded();
  const nearDateLine = await map.evaluate((svg) => {
    const p = new DOMPoint(1, 108).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await suva.mouse.click(nearDateLine.x, nearDateLine.y);
  await suva.getByRole("button", { name: "Check pin" }).click();
  await checkMapResult(map, 20);
  assert.equal(await map.locator(".rot-land").count(), 2);
  await suva.close();

  await checkMainTerritories();
  for (const [kind, play] of Object.entries(answer)) {
    const data = preparePuzzles(
      kind,
      await read(`../dist/games/data/${kind}.json`),
    );
    const questions = makeSet(kind, data, day);
    if (kind === "borderrot") {
      assert.deepEqual(
        data.items.find((route) => route[0] === "IT" && route.at(-1) === "PT"),
        ["IT", "FR", "ES", "PT"],
      );
      assert.ok(!data.graph.get("US").neighbours.includes("CU"));
      assert.ok(!data.graph.get("MA").neighbours.includes("ES"));
      assert.ok(!data.graph.get("RS").neighbours.includes("AL"));
    }
    for (const viewport of policy.viewports) {
      const mobile = viewport.width < 700;
      const context = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        colorScheme: "dark",
        reducedMotion: "reduce",
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.clock.install({ time: dayTime });
      await page.goto(new URL("/trainrot/", base).href);
      await page
        .locator(".feed-directory summary, .site-more summary")
        .press("Enter");
      await page
        .getByRole("navigation", { name: "Games" })
        .locator(`a[href="/${kind}/"]`)
        .press("Enter");
      await page.waitForURL((url) => url.pathname === `/${kind}/`);
      assert.equal(await page.title(), `${gameName(kind)} | dailyo`);
      assert.equal(await page.locator(".site-more").getAttribute("open"), null);
      await page.locator("#round-title").waitFor();
      async function inspect(state) {
        await assertEditorialUI(page);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${kind} ${state} overflow`,
        );
        if (ui)
          reports.push({
            kind,
            viewport,
            state,
            ...(await checkPage(page, policy)),
          });
      }
      await inspect("question");
      for (const [index, question] of questions.entries()) {
        await play(page, question, index, data.graph, inspect);
        const next = page.getByRole("button", {
          name: index === 4 ? "See results" : "Next",
          exact: true,
        });
        if (index === 0) {
          assert.ok(
            await next.evaluate((node) => node === document.activeElement),
          );
          await page.reload();
          await next.waitFor();
          if (kind === "maprot")
            await checkMapResult(page.locator(".rot-map"), 20);
          await inspect("review");
        }
        await next.click();
        if (kind === "maprot" && index < 4) {
          await page.waitForFunction(() => {
            const view = document.querySelector(".rot-map").viewBox.baseVal;
            return (
              Math.abs(view.x + view.width / 2 - 180) < 0.01 &&
              Math.abs(view.y + view.height / 2 - 90) < 0.01
            );
          });
          assert.equal(await page.locator(".city-pin").count(), 0);
          assert.equal(await page.locator(".rot-connector").count(), 0);
        }
      }
      const summary = await page.locator("#round-title").innerText();
      assert.match(
        summary,
        kind === "maprot" ? /^\d[\d,]* km off$/ : /^4 out of 5$/,
      );
      await page.reload();
      assert.equal(await page.locator("#round-title").innerText(), summary);
      await inspect("results");
      await page
        .getByRole("button", { name: "Copy results", exact: true })
        .click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(copied.includes(`${gameName(kind)} ${day}`));
      assert.ok(copied.includes(summary));
      assert.ok(copied.includes(`https://trainrot.vercel.app/${kind}/`));
      const clue =
        kind === "maprot"
          ? questions[0][0]
          : kind === "yearrot"
            ? questions[0].event[1]
            : data.graph.get(questions[0][0]).name;
      assert.ok(!copied.includes(clue), "Share the score without spoilers");

      await page
        .getByRole("button", {
          name: kind === "maprot" ? "Practice" : "Play practice",
          exact: true,
        })
        .click();
      assert.equal(
        await page.locator("#practice").getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Copy results", exact: true })
          .count(),
        0,
      );
      await page.reload();
      await page.locator("#round-title").waitFor();
      assert.equal(
        await page.locator("#practice").getAttribute("aria-pressed"),
        "true",
      );
      await page.locator("#daily").click();
      assert.equal(await page.locator("#round-title").innerText(), summary);
      await page.clock.setFixedTime(new Date("2026-11-16T16:00:00Z"));
      await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      );
      assert.match(
        await page.locator(".rot-counter").innerText(),
        /Question 1 of 5/,
      );
      assert.deepEqual(errors, []);
      console.log(
        `${kind} ${viewport.width}px: five rounds, reload, share, practice, and rollover passed`,
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  if (ui) {
    await fs.mkdir("test-results", { recursive: true });
    await fs.writeFile(
      "test-results/rot-ui.json",
      JSON.stringify(reports, null, 2),
    );
    for (const { kind, viewport, state, findings } of reports)
      console.log(
        `${kind} ${viewport.width}px ${state}: ${findings.length} findings`,
      );
  }
}
if (reports.some((report) => report.findings.length)) process.exitCode = 1;
