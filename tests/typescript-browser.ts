import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.env.TRAINROT_TEST_URL ?? 'http://127.0.0.1:4173';
const games = [
  ['trainrot', '.journey-ticket'], ['flags', '#question-title'], ['languages', '#question-title'],
  ['vocabulary', '#question-title'], ['maprot', '#round-title'], ['yearrot', '#round-title'],
  ['borderrot', '#round-title'], ['ladderrot', '#extra-title'], ['cluerot', '#extra-title'],
  ['scalerot', '#extra-title'], ['swaprot', '#extra-title'], ['skyrot', '#question-title'],
  ['pricerot', '#question-title'], ['skylinerot', '#question-title'], ['zoomrot', '#question-title'],
  ['orderrot', '#question-title'],
] as const;
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({viewport: {width, height: 900}});
    const errors: string[] = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const [game, ready] of games) {
      await page.goto(`${base}/${game}/`);
      await page.locator(ready).first().waitFor();
      assert.equal(await page.locator('body').evaluate(node => node.scrollWidth <= innerWidth), true, game);
    }
    await page.goto(`${base}/daily/`);
    for (let index = 0; index < games.length; index++) {
      await page.locator('#feed-progress').filter({hasText: new RegExp(`^${index + 1} of ${games.length}$`)}).waitFor();
      await page.locator('#feed-skip').click();
    }
    await page.locator('#feed-recap').waitFor();
    assert.equal(await page.locator('#feed-results li').count(), games.length);
    await page.goto(`${base}/rush/`);
    for (let index = 0; index < games.length; index++) {
      await page.locator('#rush-status').filter({hasText: /· Round 1$/}).waitFor();
      await page.locator('#rush-next').click();
    }
    await page.locator('#feed-recap').waitFor();
    assert.equal(await page.locator('#feed-results li').count(), games.length);
    assert.deepEqual(errors, []);
    console.log(`${width}px: all ${games.length} compiled games load; Feed and Rush advance to recap without browser errors.`);
    await context.close();
  }
} finally {
  await browser.close();
}
