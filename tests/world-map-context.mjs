import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const cities = JSON.parse(
  await fs.readFile("scripts/world-cities.json", "utf8"),
);
const b = await chromium.launch();
await fs.mkdir("test-results/world-map-context", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const p = await b.newPage({ viewport: { width, height: 844 } });
    for (const city of cities) {
      if (city.slug === "nyc") continue;
      await p.goto(`${base}/trainrot-world/${city.slug}/`);
      await p.locator(".map-marker-badge").first().waitFor();
      assert.ok(
        await p.locator(".map-network-context path").count(),
        `${city.slug}: continuous rail context`,
      );
      if (["adelaide", "boston", "london"].includes(city.slug))
        await p.screenshot({
          path: `test-results/world-map-context/${city.slug}-${width}.png`,
        });
    }
    await p.close();
  }
} finally {
  await b.close();
}
console.log("Every world network has continuous context on phone and desktop.");
