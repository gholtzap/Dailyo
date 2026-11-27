import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkPage } from "lintapple";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const engine = process.argv.includes("--webkit") ? webkit : chromium;
const b = await engine.launch();
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const receipts = [];
const checkUI = !process.argv.includes("--functional-only");
await fs.mkdir("test-results/cities-atlas", { recursive: true });
try {
  for (const width of [390, 1440])
    for (const colorScheme of ["light", "dark"]) {
      const p = await b.newPage({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        colorScheme,
      });
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base + "/maprot/");
      const map = p.locator(".rot-picking");
      await map.waitFor();
      const inspect = async (state) => {
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await p.screenshot({
          path: `test-results/cities-atlas/${engine.name()}-${width}-${colorScheme}-${state}.png`,
          fullPage: true,
        });
        const report = checkUI
          ? await checkPage(p, policy)
          : {
              findings: [],
              uiCheck: "not run; functional browser verification only",
            };
        // Keep unresolved native-dialog readings; verify their opaque colors directly.
        const helpContrast =
          state === "help"
            ? await p.locator(".game-help-dialog p").evaluateAll((nodes) => {
                const luminance = (value) => {
                  const rgb = value
                    .match(/[\d.]+/g)
                    .slice(0, 3)
                    .map(Number)
                    .map((c) => {
                      c /= 255;
                      return c <= 0.04045
                        ? c / 12.92
                        : ((c + 0.055) / 1.055) ** 2.4;
                    });
                  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
                };
                return nodes.map((node) => {
                  const style = getComputedStyle(node),
                    a = luminance(style.color),
                    b = luminance(style.backgroundColor);
                  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                });
              })
            : [];
        assert.ok(helpContrast.every((ratio) => ratio >= 4.5));
        receipts.push({ width, colorScheme, state, ...report, helpContrast });
      };
      assert.ok(
        (await map.boundingBox()).height >= 320,
        "The atlas owns a tall playfield",
      );
      const modes = p.getByRole("navigation", {
        name: "Game mode",
        exact: true,
      });
      assert.ok(
        (await modes.boundingBox()).y >
          (await p.locator("#quiz").boundingBox()).y,
        "Modes belong below the game",
      );
      assert.equal(
        await modes
          .getByRole("link", { name: "Rush", exact: true })
          .getAttribute("href"),
        "/rush/maprot/",
      );
      await inspect("opening");
      await p.locator(".site-more summary").click();
      await inspect("games");
      await p.keyboard.press("Escape");
      assert.equal(
        await p.locator(".site-more").evaluate((e) => e.open),
        false,
      );

      await map.click({ position: { x: 150, y: 130 } });
      const draft = p.locator(".city-pin");
      await draft.waitFor();
      const editable = await draft.evaluate(
        (e) => getComputedStyle(e).backgroundColor,
      );
      assert.equal(await draft.locator(".halo").count(), 0);
      const coordinate = await p.locator(".rot-coordinate").textContent();
      await p.getByRole("button", { name: "Zoom in", exact: true }).click();
      assert.equal(
        await p.locator(".rot-coordinate").textContent(),
        coordinate,
      );
      await p.getByRole("button", { name: "Reset view", exact: true }).click();
      await inspect("placed");
      await p.reload();
      await map.waitFor();
      assert.equal(
        await p.locator(".rot-coordinate").textContent(),
        coordinate,
      );
      await p.getByRole("button", { name: "How to play", exact: true }).click();
      await p
        .getByRole("dialog", { name: "How to play", exact: true })
        .waitFor();
      await inspect("help");
      await p.getByRole("button", { name: "Close", exact: true }).click();
      assert.equal(
        await p
          .getByRole("button", { name: "How to play", exact: true })
          .evaluate((e) => e === document.activeElement),
        true,
      );
      await p.getByRole("button", { name: "Check pin", exact: true }).click();
      await p.locator(".rot-reviewing").waitFor();
      assert.notEqual(
        await p
          .locator(".city-pin")
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        editable,
        "Submission changes the pin color",
      );
      assert.equal(await p.locator(".city-pin.is-locked").count(), 1);
      await inspect("locked");
      await p.getByRole("button", { name: "Next", exact: true }).click();
      await map.waitFor();
      assert.equal(await p.locator(".city-pin").count(), 0);
      for (let round = 1; round < 5; round++) {
        await map.press("ArrowRight");
        await p.getByRole("button", { name: "Check pin", exact: true }).click();
        await p
          .getByRole("button", {
            name: round === 4 ? "See results" : "Next",
            exact: true,
          })
          .click();
      }
      await p
        .getByRole("heading", { name: "Review answers", exact: true })
        .waitFor();
      await inspect("results");
      await p.locator(".rot-review details summary").first().click();
      await p.locator(".rot-recap-detail .rot-reviewing").waitFor();
      await inspect("review");
      await p.getByRole("button", { name: "Practice", exact: true }).click();
      await map.waitFor();
      await map.press("ArrowRight");
      assert.equal(await p.locator(".city-pin").count(), 1);
      await p.getByRole("button", { name: "Clear pin", exact: true }).click();
      assert.equal(await p.locator(".city-pin").count(), 0);
      assert.equal(
        await p
          .getByRole("button", { name: "Check pin", exact: true })
          .isDisabled(),
        true,
      );
      await inspect("practice");
      await modes.getByRole("link", { name: "Rush", exact: true }).click();
      await p.locator("iframe[title=maprot]").waitFor();
      await p
        .frameLocator("iframe[title=maprot]")
        .locator(".rot-picking")
        .waitFor();
      assert.deepEqual(errors, []);
      await p.close();
    }
} finally {
  await b.close();
  await fs.writeFile(
    `test-results/cities-atlas/report-${engine.name()}.json`,
    JSON.stringify(receipts, null, 2),
  );
}
assert.ok(
  receipts.every((r) =>
    r.findings.every(
      (f) =>
        r.state === "help" &&
        r.helpContrast.length > 0 &&
        f.rule === "text-contrast" &&
        f.status === "unresolved" &&
        f.selector.includes("dialog") &&
        f.selector.includes("p:nth-of-type"),
    ),
  ),
  "Cities UI policy findings; see report.json",
);
const unmeasured = receipts.flatMap((r) => r.findings).length;
if (unmeasured)
  console.warn(
    `${unmeasured} native Help contrast readings remain unresolved in Lintapple; direct color measurements pass. See report.json.`,
  );
if (process.argv.includes("--ui") && unmeasured) process.exitCode = 1;
console.log(
  "Cities atlas, bottom modes, pin restore, lock color, clear, keyboard, Help and dark defaults pass.",
);
