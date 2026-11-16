import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkPage } from 'lintapple';
import { distanceKm, makeSet, preparePuzzles } from '../dist/games/rot-puzzles.js';

const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
const policy = await read('../ui-policy.json');
const base = process.env.TRAINROT_TEST_URL ?? 'http://127.0.0.1:4173';
const ui = process.argv.includes('--ui');
const day = '2026-11-15';
const reports = [];
const browser = await chromium.launch();
const dayTime = new Date(`${day}T16:00:00Z`);

assert.equal(distanceKm([0, 0], [0, 0]), 0);
assert.equal(distanceKm([-179, 0], [179, 0]), 222, 'Use the short arc across the date line');

async function answerMap(page, [city, , lon, lat], index) {
  const map = page.locator('.rot-map');
  if (index === 0) {
    await map.press('ArrowRight');
    await map.press('Shift+ArrowUp');
    assert.match(await page.locator('.rot-coordinate').textContent(), /1.0° N, 5.0° E/);
    await page.reload();
    await map.waitFor();
    assert.match(await page.locator('.rot-coordinate').textContent(), /1.0° N, 5.0° E/);
  }
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  const x = box.x + box.width * (lon + 180) / 360;
  const y = box.y + box.height * (90 - lat) / 180;
  if (page.viewportSize().width < 700) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.getByRole('button', { name: 'Check pin', exact: true }).click();
  assert.equal(await map.locator('.rot-pin').count(), 2);
  const feedback = await page.locator('.rot-feedback').innerText();
  assert.ok(parseInt(feedback, 10) < 250, feedback);
  assert.ok(feedback.includes(city));
}

async function answerYear(page, { event, timeline }, index) {
  const slots = page.locator('.rot-slot');
  assert.equal(await slots.count(), timeline.length + 1);
  const slot = timeline.filter(([year]) => year < event[0]).length;
  await slots.nth(index === 0 ? (slot + 1) % (timeline.length + 1) : slot).press('Enter');
  assert.match(await page.locator('.rot-feedback').innerText(), index === 0 ? /Correct year/ : /Correct placement/);
  const years = (await page.locator('.rot-event time').allTextContents()).map(Number);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  assert.equal(await page.locator('.highlight time').textContent(), String(event[0]));
}

async function answerBorder(page, route, index, graph) {
  if (index === 4) {
    await page.getByRole('button', { name: 'Show shortest route' }).click();
    assert.equal(await page.getByRole('list', { name: 'Shortest route' }).locator('li').count(), route.length);
    return;
  }
  const search = page.getByRole('searchbox', { name: 'Add a country' });
  async function add(id) {
    const { name } = graph.get(id);
    await search.fill(name);
    await page.getByRole('button', { name, exact: true }).click();
  }
  if (index === 0) {
    const wrong = [...graph.keys()].find(id => !route.includes(id) && !graph.get(route[0]).neighbours.includes(id));
    await add(wrong);
    assert.match(await page.locator('.rot-feedback').innerText(), /share a land border/);
    assert.equal(await page.getByRole('list', { name: 'Your route' }).locator('li').count(), 1);
    await add(route[1]);
    await page.reload();
    await search.waitFor();
    assert.equal(await page.getByRole('list', { name: 'Your route' }).locator('li').count(), 2);
    await page.getByRole('button', { name: 'Undo last country' }).click();
    assert.equal(await page.getByRole('list', { name: 'Your route' }).locator('li').count(), 1);
  }
  for (const id of route.slice(1)) await add(id);
  assert.match(await page.locator('.rot-feedback').innerText(), /Shortest route/);
  assert.deepEqual(await page.getByRole('list', { name: 'Shortest route' }).locator('li').allTextContents(),
    route.map(id => graph.get(id).name));
}

async function checkMainTerritories() {
  const page = await browser.newPage();
  await page.clock.setFixedTime(new Date('2027-01-16T16:00:00Z'));
  await page.goto(`${base}/borderrot/`);
  assert.match(await page.locator('#round-title').innerText(), /^Morocco to /);
  await page.getByRole('searchbox', {name: 'Add a country'}).fill('Spain');
  await page.getByRole('button', {name: 'Spain', exact: true}).click();
  assert.match(await page.locator('.rot-feedback').innerText(), /don’t share a land border/);
  assert.deepEqual(await page.getByRole('list', {name: 'Your route'}).locator('li').allTextContents(), ['Morocco']);
  await page.close();
}

const answer = { maprot: answerMap, yearrot: answerYear, borderrot: answerBorder };

try {
  const astana=await browser.newPage();
  await astana.clock.setFixedTime(new Date('2027-03-31T16:00:00Z'));
  await astana.goto(`${base}/maprot/`);
  for(let i=0;i<2;i++){
    await astana.locator('.rot-map').press('ArrowRight');
    await astana.getByRole('button',{name:'Check pin'}).click();
    await astana.getByRole('button',{name:'Next question'}).click();
  }
  assert.equal(await astana.locator('#round-title').innerText(),'Find Astana');
  await astana.close();
  await checkMainTerritories();
  for (const [kind, play] of Object.entries(answer)) {
    const data = preparePuzzles(kind, await read(`../dist/games/data/${kind}.json`));
    const questions = makeSet(kind, data, day);
    if (kind === 'borderrot') {
      assert.deepEqual(data.items.find(route => route[0] === 'IT' && route.at(-1) === 'PT'), ['IT', 'FR', 'ES', 'PT']);
      assert.ok(!data.graph.get('US').neighbours.includes('CU'));
      assert.ok(!data.graph.get('MA').neighbours.includes('ES'));
      assert.ok(!data.graph.get('RS').neighbours.includes('AL'));
    }
    for (const viewport of policy.viewports) {
      const mobile = viewport.width < 700;
      const context = await browser.newContext({
        viewport, isMobile: mobile, hasTouch: mobile, colorScheme: 'dark',
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: dayTime });
      await page.goto(new URL('/trainrot/',base).href);
      await page.getByRole('navigation', { name: 'Games' }).getByRole('link', { name: kind, exact: true }).press('Enter');
      await page.waitForURL(url => url.pathname === `/${kind}/`);
      assert.equal(await page.title(), `${kind} | dailyo`);
      assert.equal(await page.getByRole('link', { name: kind, exact: true }).getAttribute('aria-current'), 'page');
      await page.locator('#round-title').waitFor();
      async function inspect(state) {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${kind} ${state} overflow`);
        if (ui) reports.push({ kind, viewport, state, ...await checkPage(page, policy) });
      }
      await inspect('question');
      for (const [index, question] of questions.entries()) {
        await play(page, question, index, data.graph);
        const next = page.getByRole('button', { name: index === 4 ? 'See results' : 'Next question', exact: true });
        if (index === 0) {
          assert.ok(await next.evaluate(node => node === document.activeElement));
          await page.reload();
          await next.waitFor();
          await inspect('review');
        }
        await next.click();
      }
      const summary = await page.locator('#round-title').innerText();
      assert.match(summary, kind === 'maprot' ? /^\d[\d,]* km off$/ : /^4 out of 5$/);
      await page.reload();
      assert.equal(await page.locator('#round-title').innerText(), summary);
      await inspect('results');
      await page.getByRole('button', { name: 'Copy results', exact: true }).click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(copied.includes(`${kind} ${day}`));
      assert.ok(copied.includes(summary));
      assert.ok(copied.includes(`https://trainrot.vercel.app/${kind}/`));
      const clue = kind === 'maprot' ? questions[0][0] : kind === 'yearrot' ? questions[0].event[1] :
        data.graph.get(questions[0][0]).name;
      assert.ok(!copied.includes(clue), 'Share the score without spoilers');

      await page.getByRole('button', { name: 'Play practice', exact: true }).click();
      assert.equal(await page.locator('#practice').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Copy results', exact: true }).count(), 0);
      await page.reload();
      await page.locator('#round-title').waitFor();
      assert.equal(await page.locator('#practice').getAttribute('aria-pressed'), 'true');
      await page.locator('#daily').click();
      assert.equal(await page.locator('#round-title').innerText(), summary);
      await page.clock.setFixedTime(new Date('2026-11-16T16:00:00Z'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      assert.match(await page.locator('.rot-counter').innerText(), /Question 1 of 5/);
      assert.deepEqual(errors, []);
      console.log(`${kind} ${viewport.width}px: five rounds, reload, share, practice, and rollover passed`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  if (ui) {
    await fs.mkdir('test-results', { recursive: true });
    await fs.writeFile('test-results/rot-ui.json', JSON.stringify(reports, null, 2));
    for (const { kind, viewport, state, findings } of reports) console.log(`${kind} ${viewport.width}px ${state}: ${findings.length} findings`);
  }
}
if (reports.some(report => report.findings.length)) process.exitCode = 1;
