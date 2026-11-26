import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch(),
  receipts = [];
await fs.mkdir("test-results/rush-map-feedback", { recursive: true });
try {
  for (const width of [390, 1440])
    for (const game of ["maprot", "yearrot"])
      for (const explicit of [false, true]) {
        console.log(
          `${width}px ${game}: ${explicit ? "explicit" : "automatic"} answer hold`,
        );
        const page = await browser.newPage({
          viewport: { width, height: 844 },
          hasTouch: true,
          isMobile: width === 390,
        });
        const time = new Date("2026-11-22T17:00:00Z");
        await page.clock.install({ time });
        await page.clock.pauseAt(new Date(+time + 1000));
        await page.goto(`${base}/rush/${game}/`);
        await page
          .locator("#rush-status")
          .filter({ hasText: "Round 1" })
          .waitFor();
        const frame = page.frameLocator(`iframe[title=${game}]`);
        if (game === "maprot") {
          await frame
            .locator(".rot-picking")
            .click({ position: { x: 80, y: 60 } });
          await frame
            .getByRole("button", { name: "Check pin", exact: true })
            .click();
        } else await frame.locator(".rot-slot").first().click();
        await page
          .locator("#rush-status")
          .filter({ hasText: /Correct|Missed/ })
          .waitFor();
        const outcome = await page.locator("#rush-status").innerText();
        const answerTitle = await frame.locator("#round-title").innerText();
        await (game === "maprot" ? frame : page)
          .getByRole("button", {
            name: game === "maprot" ? "Enlarge map" : "How to play",
            exact: true,
          })
          .click();
        await page.clock.fastForward(5000);
        assert.equal(
          await frame.locator("#round-title").innerText(),
          answerTitle,
          "Reading an open dialog holds feedback",
        );
        const closed =
          game === "yearrot"
            ? page.evaluate(
                () =>
                  new Promise((resolve) => {
                    const listener = (event) => {
                      if (
                        event.origin === location.origin &&
                        event.data?.type === "rush-help" &&
                        event.data.open === false
                      ) {
                        window.removeEventListener("message", listener);
                        resolve();
                      }
                    };
                    window.addEventListener("message", listener);
                  }),
              )
            : frame.locator("dialog[open]").evaluate(
                (dialog) =>
                  new Promise((resolve) =>
                    dialog.addEventListener("close", () => resolve(), {
                      once: true,
                    }),
                  ),
              );
        await frame.getByRole("button", { name: "Close", exact: true }).click();
        await closed;
        assert.equal(await page.locator("#rush-clock").innerText(), "");
        const result = frame.locator("#round-title");
        await result.dispatchEvent("pointerdown", {
          button: 0,
          pointerId: 1,
          pointerType: "touch",
        });
        await result.dispatchEvent("pointerdown", {
          button: 0,
          pointerId: 2,
          pointerType: "touch",
        });
        if (explicit)
          await page
            .getByRole("button", { name: "Keep answer", exact: true })
            .click();
        await result.dispatchEvent("pointerup", {
          button: 0,
          pointerId: 1,
          pointerType: "touch",
        });
        await page.clock.fastForward(5000);
        assert.equal(
          await frame.locator("#round-title").innerText(),
          answerTitle,
          "The second finger must still hold the answer",
        );
        await result.dispatchEvent("pointercancel", {
          button: 0,
          pointerId: 2,
          pointerType: "touch",
        });
        await result.dispatchEvent("touchend", {
          changedTouches: [],
          touches: [],
        });
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            value: true,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.clock.fastForward(10000);
        assert.equal(
          await frame.locator("#round-title").innerText(),
          answerTitle,
          "Feedback waits while the page is hidden",
        );
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            value: false,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.clock.fastForward(10000);
        if (explicit) {
          assert.equal(
            await frame.locator("#round-title").innerText(),
            answerTitle,
            "Cancellation must preserve an explicit Keep answer",
          );
          await page.locator("#rush-next").click();
        }
        if (outcome === "Correct")
          await page
            .locator("#rush-status")
            .filter({ hasText: "Round 2" })
            .waitFor();
        else
          await page
            .getByRole("heading", { name: "Rush recap", exact: true })
            .waitFor();
        await page.close();
        receipts.push({
          width,
          game,
          explicit,
          cancelledTouch: explicit
            ? "explicit hold preserved until Next"
            : "auto advanced",
        });
      }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/rush-map-feedback/progression.json",
    JSON.stringify(receipts, null, 2),
  );
}
