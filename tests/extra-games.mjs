import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { checkPage } from 'lintapple';
import { extraGames, extraPuzzle, extraScoreLabel, prepareExtra, replayExtra } from '../dist/games/extra-puzzles.js';

const read = async name => JSON.parse(await fs.readFile(new URL(name, import.meta.url), 'utf8'));
const base = process.env.TRAINROT_TEST_URL ?? 'http://127.0.0.1:4173';
const ui = process.argv.includes('--ui');
const policy = await read('../ui-policy.json');
const day = '2026-11-17';
const browser = await chromium.launch();
const reports = [];
const date = new Date(`${day}T16:00:00Z`);

function sortMoves(puzzle) {
  const board = [...puzzle.board];
  const moves = [];
  for (let pass = 0; pass < board.length; pass++) for (let i = 0; i < board.length-1; i++) {
    if (board[i] <= board[i+1]) continue;
    [board[i], board[i+1]] = [board[i+1], board[i]];
    moves.push(i);
  }
  return moves;
}

try {
  for (const game of extraGames) {
    const data = prepareExtra(game, game === 'swaprot' ? undefined : await read(`../dist/games/data/${game}.json`),
      game === 'ladderrot' ? await read('../dist/games/data/ladder-words.json') : undefined);
    const puzzle = extraPuzzle(game, data, day);
    assert.equal(replayExtra(game, puzzle, [false]), undefined);
    if (game === 'swaprot') assert.equal(sortMoves(puzzle).length, puzzle.minimum);

    for (const viewport of policy.viewports) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700,
        colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
      const requests = [];
      await context.route('**/api/daily-score', async route => {
        const result = route.request().postDataJSON();
        requests.push(result);
        const state = replayExtra(game, puzzle, result.answers);
        await route.fulfill({json: {score: state?.score, lower: 1, tied: 0, others: 1}});
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: date });
      await page.goto(new URL('/trainrot/',base).href);
      await page.locator('.feed-directory summary, .site-more summary').press('Enter');
      await page.getByRole('navigation', {name:'Games'}).getByRole('link', {name:game,exact:true}).press('Enter');
      const heading = page.locator('#extra-title');
      await heading.waitFor();
      const inspect = async state => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (ui) reports.push({game, width:viewport.width, state, ...await checkPage(page,policy)});
      };
      await inspect('playing');
      let answer;
      if (game === 'ladderrot') {
        const input = page.getByLabel('Next word');
        await input.fill('zzzz');
        await input.press('Enter');
        assert.match(await page.locator('.rot-feedback').first().innerText(), /exactly one letter/);
        for (const word of puzzle.solution.slice(1)) {
          await input.fill(word);
          await input.press('Enter');
          if (word === puzzle.solution[1]) {
            await page.reload();
            await input.waitFor();
            assert.equal(await page.getByRole('list', {name:'Your word ladder'}).locator('li').count(), 2);
          }
        }
        answer = puzzle.solution.length-1;
      } else if (game === 'cluerot') {
        const input = page.getByLabel('Your guess');
        await page.getByRole('button', {name:'Next clue'}).click();
        await page.reload();
        await input.waitFor();
        assert.equal(await heading.innerText(),'Clue 2 of 5');
        await input.fill(puzzle.answer);
        await input.press('Enter');
        answer = 2;
      } else if (game === 'scalerot') {
        await page.getByRole('spinbutton').fill(String(puzzle.actual * 1.1));
        await page.getByRole('button', {name:'Check estimate'}).click();
        answer = 1000;
      } else {
        const tiles = page.locator('.swap-tile');
        const moves = sortMoves(puzzle);
        for (const [index, move] of moves.entries()) {
          await tiles.nth(move).press('Enter');
          await tiles.nth(move+1).press('Enter');
          if (!index && moves.length > 1) {
            const board = await tiles.allTextContents();
            await page.reload();
            await tiles.first().waitFor();
            assert.deepEqual(await tiles.allTextContents(), board);
          }
        }
        answer = puzzle.minimum;
      }
      const expected = extraScoreLabel(game, answer);
      assert.equal(await heading.innerText(), expected);
      await page.locator('.daily-rank').getByText('You placed ahead of 100% of today’s other finishers').waitFor();
      assert.equal(requests[0].puzzle, puzzle.id);
      assert.equal(replayExtra(game, puzzle, requests[0].answers).score, answer);
      await page.reload();
      assert.equal(await heading.innerText(), expected);
      await inspect('result');
      await page.getByRole('button', {name:'Copy results'}).click();
      const share = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(share.includes(expected));
      assert.ok(share.includes(`https://trainrot.vercel.app/${game}/`));
      await page.getByRole('button', {name:'Play practice'}).click();
      assert.equal(await page.locator('#practice').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.daily-rank').count(), 0);
      await inspect('practice');
      await page.locator('#daily').click();
      assert.equal(await heading.innerText(), expected);
      await page.clock.setFixedTime(new Date('2026-11-18T16:00:00Z'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      assert.equal(await page.getByRole('button', {name:'Copy results'}).count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${game} ${viewport.width}px: play, restore, rank, share, practice, rollover`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  if (ui) {
    await fs.mkdir('test-results', {recursive:true});
    await fs.writeFile('test-results/extra-ui.json', JSON.stringify(reports,null,2));
    for (const {game,width,state,findings} of reports) console.log(`${game} ${width}px ${state}: ${findings.length} findings`);
    if (reports.some(report => report.findings.length)) process.exitCode = 1;
  }
}
