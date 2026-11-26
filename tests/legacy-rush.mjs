import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.TRAINROT_TEST_URL ?? "http://127.0.0.1:4173";
const b = await chromium.launch();
try {
  for (const game of ["cluerot", "ladderrot"])
    for (const slash of ["", "/"]) {
      const p = await b.newPage({ viewport: { width: 390, height: 568 } });
      await p.goto(`${base}/rush/${game}${slash}`);
      await p.waitForURL(`${base}/${game}/`);
      await p.locator("main").waitFor();
      assert.equal(await p.locator("iframe").count(), 0);
      assert.equal(await p.locator("body").getAttribute("data-game"), game);
      await p
        .getByRole("button", { name: "How to play", exact: true })
        .waitFor();
      await p.close();
    }
} finally {
  await b.close();
}
console.log("Legacy Clues and Word ladders Rush links open their named games.");
