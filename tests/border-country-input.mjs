import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { checkPage } from "lintapple";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const raw = JSON.parse(
  await fs.readFile("dist/games/data/borderrot.json", "utf8"),
);
const geometry = JSON.parse(
  await fs.readFile("dist/games/data/border-map.json", "utf8"),
);
const ids = ["MM", "IN", "PK", "IR", "TR", "CN", "AF", "AZ", "GE"];
const fixture = raw
  .filter(([id]) => ids.includes(id))
  .map(([id, name, ns]) => [id, name, ns.filter((n) => ids.includes(n))]);
const policy = JSON.parse(await fs.readFile("ui-policy.json", "utf8"));
const browser = await chromium.launch(),
  receipts = [];
await fs.mkdir("test-results/border-country-input", { recursive: true });
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: viewport.width === 390,
      colorScheme: "dark",
    });
    await page.clock.setFixedTime(new Date("2030-03-11T16:00:00Z"));
    await page.route("**/games/data/borderrot.json", (r) =>
      r.fulfill({ json: fixture }),
    );
    await page.goto(`${base}/borderrot/`);
    await page
      .getByRole("heading", { name: "Myanmar to Türkiye", exact: true })
      .waitFor();
    const input = page.getByRole("searchbox", { name: "Add a country" });
    const route = () =>
      page
        .getByRole("list", { name: "Your route" })
        .locator("li")
        .allTextContents();
    async function tapCountry(id) {
      const point = await page
        .locator(".border-map canvas")
        .evaluate((canvas, anchor) => {
          const p = new DOMPoint(...anchor).matrixTransform(
            canvas.getContext("2d").getTransform(),
          );
          return {
            x: (p.x / canvas.width) * canvas.clientWidth,
            y: (p.y / canvas.height) * canvas.clientHeight,
          };
        }, geometry.anchors[id]);
      await page.locator(".border-map canvas").click({ position: point });
    }
    await input.fill("Iran");
    assert.deepEqual(await route(), ["Myanmar"]);
    assert.match(
      await page.locator(".rot-feedback").innerText(),
      /Iran and Myanmar don’t share a land border/,
    );
    await input.press("Enter");
    await page.getByRole("button", { name: "Iran", exact: true }).click();
    await tapCountry("IR");
    assert.deepEqual(await route(), ["Myanmar"]);
    const error = await checkPage(page, policy);
    await page.screenshot({
      path: `test-results/border-country-input/${viewport.width}-rejected.png`,
    });
    await input.fill("India");
    assert.deepEqual(await route(), ["Myanmar", "India"]);
    await input.fill("Pak");
    await input.press("Enter");
    assert.deepEqual(await route(), ["Myanmar", "India", "Pakistan"]);
    await input.fill("Ir");
    await page.getByRole("button", { name: "Iran", exact: true }).click();
    assert.deepEqual(await route(), ["Myanmar", "India", "Pakistan", "Iran"]);
    await page.getByRole("button", { name: "Undo last country" }).click();
    await input.fill("Ir");
    await input.press("Enter");
    assert.deepEqual(await route(), ["Myanmar", "India", "Pakistan", "Iran"]);
    await page.getByRole("button", { name: "Undo last country" }).click();
    await tapCountry("IR");
    assert.deepEqual(await route(), ["Myanmar", "India", "Pakistan", "Iran"]);
    await page.reload();
    await input.waitFor();
    assert.deepEqual(await route(), ["Myanmar", "India", "Pakistan", "Iran"]);
    const playing = await checkPage(page, policy);
    await page.screenshot({
      path: `test-results/border-country-input/${viewport.width}-route.png`,
    });
    await tapCountry("TR");
    assert.match(
      await page.locator(".rot-feedback").innerText(),
      /Shortest route/,
    );
    assert.deepEqual(
      await page
        .getByRole("list", { name: "Shortest route" })
        .locator("li")
        .allTextContents(),
      ["Myanmar", "India", "Pakistan", "Iran", "Türkiye"],
    );
    for (const report of [error, playing])
      assert.deepEqual(
        report.findings.filter((f) => f.status !== "unresolved"),
        [],
      );
    if (
      process.argv.includes("--ui") &&
      [error, playing].some((r) => r.findings.length)
    )
      process.exitCode = 1;
    receipts.push({
      viewport,
      fixture: ids,
      steps:
        "Iran rejected by typing, Enter, dropdown and map; India automatic; Pakistan Enter; Iran dropdown, Enter, map; reload; Türkiye map completes",
      reports: { error, playing },
    });
    await page.close();
    const ambiguity = await browser.newPage({ viewport, colorScheme: "dark" });
    await ambiguity.goto(`${base}/borderrot/`);
    const search = ambiguity.getByRole("searchbox", { name: "Add a country" });
    await search.fill("Guinea");
    assert.equal(await search.inputValue(), "Guinea");
    assert.equal(await ambiguity.locator(".rot-feedback").innerText(), "");
    assert.ok(
      await ambiguity
        .getByRole("button", { name: "Guinea", exact: true })
        .count(),
    );
    await search.fill("Congo");
    assert.equal(await ambiguity.locator(".rot-feedback").innerText(), "");
    assert.equal(
      await ambiguity
        .getByRole("group", { name: "Matching countries" })
        .getByRole("button")
        .count(),
      2,
    );
    await search.press("Enter");
    assert.equal(await search.inputValue(), "Congo");
    await search.dispatchEvent("compositionstart");
    await search.fill("Iran");
    assert.equal(await ambiguity.locator(".rot-feedback").innerText(), "");
    await search.dispatchEvent("compositionend");
    await ambiguity.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    "test-results/border-country-input/results.json",
    JSON.stringify(receipts, null, 2),
  );
}
console.log(
  "Border country input: mobile/desktop automatic names, ambiguity, composition, Enter, dropdown, map, invalid borders, persistence and completion passed.",
);
