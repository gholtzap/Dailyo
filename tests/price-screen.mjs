import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
import { setPrice } from "./input-helpers.mjs";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4189";
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const browser = await engine.launch();
const out = "test-results/price-screen";
await fs.mkdir(out, { recursive: true });
const reports = [];
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 620 },
    { width: 1440, height: 1000 },
  ])
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport,
        colorScheme,
        hasTouch: viewport.width < 600,
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install({ time: new Date("2026-11-28T17:00:00Z") });
      await page.clock.pauseAt(new Date("2026-11-28T17:00:01Z"));
      await page.addInitScript(() => {
        if (
          window.parent !== window ||
          sessionStorage.getItem("dailyo:rush:run:pricerot")
        )
          return;
        sessionStorage.setItem(
          "dailyo:rush:run:pricerot",
          JSON.stringify({
            date: "2026-11-28",
            games: "pricerot",
            runId: "00000000-0000-4000-8000-000000000001",
            index: 0,
            round: 1,
            remaining: 18000,
            scores: [1],
            streak: 1,
          }),
        );
      });
      await page.goto(`${base}/rush/pricerot/?date=2026-11-28`);
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      const child = page.frameLocator('iframe[title="pricerot"]');
      await child.locator(".price-submit").waitFor();
      const inspect = async (state) => {
        // The installed checker supports Chromium; WebKit still exercises behavior.
        if (engine === chromium && process.argv.includes("--ui")) {
          await page.clock.resume();
          const frame = await (
            await page.locator('iframe[title="pricerot"]').elementHandle()
          ).contentFrame();
          for (const [scope, surface] of [
            ["host", page],
            ["game", frame],
          ])
            reports.push({
              viewport,
              colorScheme,
              state,
              scope,
              ...(await checkPage(surface, policy)),
            });
        }
      };
      console.log(viewport.width, colorScheme, "ready");
      assert.equal(await child.locator(".price-submit").isDisabled(), true);
      assert.equal(
        await child
          .locator("select,input[type=text],input[type=number]")
          .count(),
        0,
      );
      await page.clock.runFor(100);
      const target = await page.locator("#rush-pause").boundingBox();
      assert.ok(target.width >= 44 && target.height >= 44);
      const submit = await child.locator(".price-submit").boundingBox();
      const skip = await page.locator("#rush-next").boundingBox();
      assert.ok(submit.y + submit.height <= viewport.height);
      assert.ok(
        Math.abs(skip.y - submit.y) < 16 && skip.x >= submit.x + submit.width,
        JSON.stringify({ skip, submit }),
      );

      await setPrice(child, 3.49);
      await child
        .getByRole("slider", { name: "Cents", exact: true })
        .press("ArrowUp");
      assert.equal(await child.locator("#price-value").textContent(), "$3.50");
      const dollars = child.getByRole("slider", {
        name: "Dollars",
        exact: true,
      });
      const box = await dollars.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 60);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 24, { steps: 3 });
      await page.mouse.up();
      assert.equal(await child.locator("#price-value").textContent(), "$5.50");
      await setPrice(child, 0);
      assert.equal(await child.locator(".price-submit").isDisabled(), false);
      await setPrice(child, 10000);
      assert.equal(
        await child
          .getByRole("slider", { name: "Cents", exact: true })
          .isDisabled(),
        true,
      );
      await setPrice(child, 3.49);
      const meter = () =>
        page.locator(".rush-track span").evaluate((e) => ({
          width: e.getBoundingClientRect().width,
          color: getComputedStyle(e).backgroundColor,
        }));
      const full = await meter();
      await page.clock.runFor(7000);
      assert.equal(await page.locator("#rush-clock").textContent(), "11");
      const partial = await meter();
      assert.ok(partial.width < full.width);
      assert.notEqual(partial.color, full.color);
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const paused = await meter();
      await page.clock.runFor(2000);
      assert.deepEqual(await meter(), paused);

      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await page.getByRole("button", { name: "Help", exact: true }).click();
      await child.getByRole("dialog").waitFor();

      await child.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      assert.equal(await child.locator("#price-value").textContent(), "$3.49");
      await page.reload();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      assert.equal(await child.locator("#price-value").textContent(), "$3.49");
      await page.clock.runFor(8000);
      assert.equal(await page.locator("#rush-clock").textContent(), "3");
      const low = await meter();
      assert.ok(low.width < partial.width);
      const [red, green] = low.color.match(/\d+/g).map(Number);
      assert.ok(red > green);

      await page.screenshot({
        path: `${out}/${engine.name()}-${viewport.width}-${colorScheme}.png`,
        fullPage: true,
      });
      await child.getByRole("button", { name: "Lock in", exact: true }).click();
      await child.locator(".visual-reveal").waitFor();
      if (process.argv.includes("--ui") && engine === chromium) {
        await page.evaluate(() => {
          sessionStorage.setItem(
            "dailyo:rush:run:pricerot",
            JSON.stringify({
              date: "2026-11-28",
              games: "pricerot",
              runId: "00000000-0000-4000-8000-000000000001",
              index: 0,
              round: 1,
              remaining: 18000,
              scores: [1],
              streak: 1,
            }),
          );
          sessionStorage.removeItem("dailyo:rush:draft");
        });
        await page.reload();
        await page.getByRole("button", { name: "Resume", exact: true }).click();
        await inspect("opening");
        await setPrice(child, 3.49);
        await inspect("selected");
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await inspect("paused");
        await page.getByRole("button", { name: "Resume", exact: true }).click();
        await page.getByRole("button", { name: "Help", exact: true }).click();
        await child.getByRole("dialog").waitFor();
        await inspect("help");
        await child.getByRole("button", { name: "Close", exact: true }).click();
        await page.getByRole("button", { name: "Resume", exact: true }).click();
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
} finally {
  await browser.close();
  await fs.writeFile(
    `${out}/${engine.name()}-ui.json`,
    JSON.stringify(reports, null, 2),
  );
}
const failures = reports.flatMap((r) => r.findings ?? []);
assert.deepEqual(failures, []);
console.log(
  `${engine.name()}: price reels, zero/bounds, visible submit/skip, timer colors, pause, Help, recovery and submit passed in six viewport/theme combinations`,
);
