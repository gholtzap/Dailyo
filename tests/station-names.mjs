import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const b = await chromium.launch();
await fs.mkdir("test-results/station-names", { recursive: true });
try {
  for (const width of [390, 1440]) {
    const p = await b.newPage({ viewport: { width, height: 844 } });
    await p.clock.setFixedTime(new Date("2026-11-26T17:00:00Z"));
    await p.goto(`${base}/trainrot-world/kaohsiung/`);
    await p.locator(".endpoint strong").first().waitFor();
    assert.doesNotMatch(
      await p.locator("#app").innerText(),
      /Station \d+| · s\d+/,
    );
    await p.screenshot({
      path: `test-results/station-names/kaohsiung-${width}.png`,
    });
    const failures = await p.evaluate(async () => {
      const cities = await fetch("/world-data/cities.json").then((r) =>
        r.json(),
      );
      const failures = [];
      for (const city of cities) {
        if (city.slug === "nyc") continue;
        const n = await fetch(`/world-data/${city.slug}/network.json`).then(
          (r) => r.json(),
        );
        const c = await fetch(`/world-data/${city.slug}/challenges.json`).then(
          (r) => r.json(),
        );
        for (const s of Object.values(n.stations))
          if (/Station \d+| · s\d+/.test(s.label))
            failures.push([city.slug, s.label]);
        for (const q of c)
          for (const end of ["from", "to"])
            if (q[end + "Title"] !== n.stations[q[end]].label)
              failures.push([city.slug, q[end + "Title"]]);
      }
      return failures;
    });
    assert.deepEqual(
      failures,
      [],
      "Every published city uses public labels consistently in puzzles",
    );
    await p.close();
  }
} finally {
  await b.close();
}
console.log(
  "All published station and puzzle labels omit provider IDs; Kaohsiung renders real names.",
);
