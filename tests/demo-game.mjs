import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { checkPage } from 'lintapple';
import { createRouter } from '../dist/router.js';

const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
const [network, challenges, policy] = await Promise.all([
  read('../dist/data/network.json'), read('../dist/data/challenges.json'), read('../ui-policy.json'),
]);
const router = createRouter(network);
const base = process.env.TRAINROT_TEST_URL ?? 'http://127.0.0.1:4173';
const ui = process.argv.includes('--ui');
const reports = [];
const browser = await chromium.launch();
try {
  for (const viewport of policy.viewports) {
    const page = await browser.newPage({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
    const inspect = async state => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (ui) reports.push({ width: viewport.width, state, ...await checkPage(page, policy) });
    };
    await page.goto(base);
    const games = page.getByRole('navigation', { name: 'Games' });
    for (const [game, path] of [['flagrot', '/flags/'], ['langrot', '/languages/'], ['trainrot', '/']]) {
      await games.getByRole('link', { name: game, exact: true }).press('Enter');
      await page.waitForURL(url => url.pathname === path);
      assert.equal(await page.title(), `${game} | dailyo`);
      assert.equal(await games.locator('[aria-current="page"]').textContent(), game);
    }
    await page.getByRole('group', { name: 'Add a train' }).waitFor();
    assert.equal(await page.locator('.demo-map-label').innerText(), 'Harbour City · Fictional network');
    assert.match(await page.locator('#city-map').getAttribute('aria-label'), /Harbour City map/);
    assert.equal(await page.locator('.map-place').count(), 0);
    await inspect('daily');

    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('combobox', { name: 'Difficulty' }).selectOption('hard');
    const endpoints = await page.locator('.endpoint strong').allTextContents();
    const challenge = challenges.find(c => c.fromTitle === endpoints[0] && c.toTitle === endpoints[1]);
    assert.equal(challenge?.difficulty, 'hard');
    const { legs } = router.best(challenge.from, challenge.to);
    assert.equal(legs.length, 3);
    await page.locator(`[data-route="${legs[0].route}"]`).click();
    await page.reload();
    await page.locator('#practice-mode[aria-pressed=true]').waitFor();
    assert.deepEqual(await page.locator('.endpoint strong').allTextContents(), endpoints);
    assert.equal(await page.locator('.train-sequence li').count(), 1);
    for (const { route } of legs.slice(1)) await page.locator(`[data-route="${route}"]`).click();
    await page.getByRole('button', { name: 'Check route', exact: true }).click();
    await page.locator('.result-score').waitFor();
    assert.equal(parseInt(await page.locator('.result-score').textContent()), 100);
    await inspect('result');
    await page.getByRole('button', { name: 'Next journey', exact: true }).click();
    assert.notDeepEqual(await page.locator('.endpoint strong').allTextContents(), endpoints);
    await page.close();
    console.log(`${viewport.width}px: navigation, fictional map, practice save, transfer scoring, and next puzzle passed`);
  }
} finally {
  await browser.close();
  if (ui) {
    await fs.mkdir('test-results', { recursive: true });
    await fs.writeFile('test-results/demo-ui.json', JSON.stringify(reports, null, 2));
  }
}
if (reports.some(report => report.findings.length)) process.exitCode = 1;
