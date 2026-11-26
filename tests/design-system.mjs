import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const tokens = JSON.parse(await fs.readFile("design/tokens.json", "utf8"));
const output = "test-results/design-system";
const reports = [];
const browser = await chromium.launch();
await fs.mkdir(output, { recursive: true });
try {
  for (const width of [390, 1440])
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        colorScheme,
        reducedMotion: "reduce",
      });
      await page.goto(`${base}/flags/`);
      await page.locator(".choice").first().waitFor();
      const result = await page.evaluate(async () => {
        const { designValue } = await import("/design.js");
        const { angleBoard } = await import("/games/angle-board.js");
        const choices = [...document.querySelectorAll(".choice")];
        const styles = choices.map((node) => {
          const style = getComputedStyle(node);
          return {
            background: style.backgroundColor,
            shadow: style.boxShadow,
            lip: style.getPropertyValue("--answer-lip").trim(),
          };
        });
        const tokenSheet = document
          .querySelector('link[rel="stylesheet"]')
          ?.getAttribute("href");
        const root = document.documentElement;
        const normal = designValue("--action");
        root.style.setProperty("--action", "#ff00ff");
        const override = getComputedStyle(choices[0]).backgroundColor;
        root.style.removeProperty("--action");
        root.style.setProperty("--accent", "#ff00ff");
        const { canvas } = angleBoard({
          target: 45,
          value: () => 90,
          change: () => {},
          editable: () => false,
          reveal: false,
          max: 360,
        });
        const pixel = [
          ...canvas.getContext("2d").getImageData(480, 200, 1, 1).data,
        ];
        root.style.removeProperty("--accent");
        return {
          tokenSheet,
          styles,
          normal,
          override,
          pixel,
          scheme: getComputedStyle(root).colorScheme,
        };
      });
      assert.equal(result.tokenSheet, "/design-system.css");
      assert.equal(result.scheme, "dark");
      assert.equal(result.normal, tokens.color.action);
      assert.equal(
        new Set(result.styles.map((style) => style.background)).size,
        4,
      );
      for (const style of result.styles)
        assert.notEqual(
          style.shadow,
          "none",
          "Each answer piece must resolve its scoped shadow recipe",
        );
      assert.equal(
        new Set(result.styles.map((style) => style.shadow)).size,
        4,
        "Each coloured lip must resolve on its own piece",
      );
      assert.equal(
        result.override,
        "rgb(255, 0, 255)",
        "CSS components consume the shared palette",
      );
      assert.deepEqual(
        result.pixel,
        [255, 0, 255, 255],
        "Canvas consumes the same palette",
      );
      await page.screenshot({
        path: `${output}/${width}-${colorScheme}-components.png`,
        fullPage: true,
      });
      reports.push({ width, colorScheme, ...result });
      await page.close();
    }
} finally {
  await browser.close();
  await fs.writeFile(
    `${output}/browser.json`,
    JSON.stringify(reports, null, 2),
  );
}
console.log(
  "Shared CSS/canvas tokens, scoped piece shadows, stylesheet order and dark default passed in four viewport/preference combinations.",
);
