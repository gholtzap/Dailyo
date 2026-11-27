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
        return {
          tokenSheet,
          styles,
          normal,
          override,
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
      await page.goto(`${base}/borderrot/`);
      await page.locator("canvas.rot-map").waitFor();
      await page.evaluate(() => {
        for (const token of [
          "--map-country",
          "--map-country-selected",
          "--map-country-target",
        ])
          document.documentElement.style.setProperty(token, "#ff00ff");
      });
      await page
        .getByRole("button", { name: "Show shortest route", exact: true })
        .click();
      const canvasUsesToken = await page
        .locator("canvas.rot-map")
        .evaluate((canvas) => {
          const pixels = canvas
            .getContext("2d")
            .getImageData(0, 0, canvas.width, canvas.height).data;
          for (let index = 0; index < pixels.length; index += 4)
            if (
              pixels[index] === 255 &&
              pixels[index + 1] === 0 &&
              pixels[index + 2] === 255 &&
              pixels[index + 3] === 255
            )
              return true;
          return false;
        });
      assert.equal(
        canvasUsesToken,
        true,
        "Borders canvas consumes the shared palette",
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
