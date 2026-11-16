import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.env.TRAINROT_TEST_URL;
assert.ok(base, 'Set TRAINROT_TEST_URL to a deployment with a disposable scores database.');
const browser = await chromium.launch();
try {
  const mobile = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'dark'});
  const desktop = await browser.newContext({viewport: {width: 1440, height: 1000}, colorScheme: 'dark'});
  const train = await desktop.newPage();
  await train.goto(base);
  const routes = await train.evaluate(async () => {
    const [{dailyChallenge, dailyDate}, {createRouter}, network, challenges] = await Promise.all([
      import('/daily/puzzles.js'), import('/router.js'),
      fetch('/data/network.json').then(r => r.json()), fetch('/data/challenges.json').then(r => r.json()),
    ]);
    const {from, to} = dailyChallenge(challenges, dailyDate());
    return createRouter(network).best(from, to).legs.map(leg => leg.route);
  });
  for (const route of routes) await train.locator('[data-route="' + route + '"]').click();
  await train.locator('#reveal').click();
  await train.locator('.daily-rank').getByText('First finisher today', {exact: true}).waitFor();
  await train.waitForFunction(() => document.querySelector('.result-score')?.textContent.includes('100'));
  const skipped = await mobile.newPage();
  await skipped.goto(base);
  await skipped.locator('#show-answer').click();
  assert.equal(await skipped.locator('.daily-rank').count(), 0);
  await skipped.close();

  for (const game of ['flags', 'languages', 'vocabulary']) {
    for (const [context, perfect] of [[mobile, false], [desktop, true]]) {
      const page = await context.newPage();
      await page.goto(base + '/' + game + '/');
      for (let i = 0; i < 5; i++) {
        const buttons = page.locator('.choice');
        await buttons.first().waitFor();
        await buttons.nth(await page.evaluate(async ({game, perfect}) => {
          const {dailyDate, quizOptions, quizDeck} = await import('/daily/puzzles.js');
          const items = await (await fetch('/games/data/' + game + '.json')).json();
          const day = dailyDate();
          const i = Number(document.querySelector('.round-head p').textContent.match(/Question (\d+)/)[1]) - 1;
          const item = quizDeck(items, game, day)[i];
          return quizOptions(items, game, item, 'daily:' + game + ':' + day + ':' + i).findIndex(option => (option.id === item.id) === perfect);
        }, {game, perfect})).click();
        await page.locator('#next').click();
      }
      const rank = page.locator('.daily-rank');
      const expected = perfect ? /You scored higher than 100%/ : /First finisher today/;
      await rank.getByText(expected).waitFor();
      const result = await page.locator('.result h2').innerText();
      assert.equal(result, perfect ? '5 out of 5' : '0 out of 5');
      if (perfect) {
        const replay = await page.evaluate(async game => {
          const {dailyDate, quizDeck, quizOptions, quizPuzzle} = await import('/daily/puzzles.js');
          const items = await (await fetch('/games/data/' + game + '.json')).json();
          const day = dailyDate(), deck = quizDeck(items, game, day);
          const answers = deck.map((item, i) => quizOptions(items, game, item, 'daily:' + game + ':' + day + ':' + i).find(option => option.id !== item.id).id);
          const body = {game, day, puzzle: quizPuzzle(deck), answers};
          const submit = data => fetch('/api/daily-score', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data),
          });
          const invalid = await submit({...body, answers: ['invalid', ...answers.slice(1)]});
          const saved = await submit(body);
          return {invalid: invalid.status, rank: await saved.json()};
        }, game);
        assert.deepEqual(replay, {invalid: 400, rank: {score: 5, lower: 1, tied: 0, others: 1}});
      }
      await page.reload();
      await rank.getByText(expected).waitFor();
      assert.equal(await page.locator('.result h2').innerText(), result);
      await page.close();
    }
  }
  for (const game of ['maprot', 'yearrot', 'borderrot']) {
    for (const [context, perfect] of [[mobile, false], [desktop, true]]) {
      const page = await context.newPage();
      await page.goto(base + '/' + game + '/');
      await page.locator('#round-title').waitFor();
      await page.evaluate(async ({game, perfect}) => {
        const {dailyDate} = await import('/daily/puzzles.js');
        const {makeSet, preparePuzzles, roundCount} = await import('/games/rot-puzzles.js');
        const day = dailyDate();
        const raw = await (await fetch('/games/data/' + game + '.json')).json();
        const questions = makeSet(game, preparePuzzles(game, raw), day);
        const answers = questions.map(question => {
          if (game === 'maprot') return perfect ? question.slice(2) : [0, 0];
          if (game === 'borderrot') return perfect ? question.slice(1) : null;
          const slot = question.timeline.filter(([year]) => year < question.event[0]).length;
          return perfect ? slot : (slot + 1) % (question.timeline.length + 1);
        });
        localStorage.setItem('dailyo:' + game + ':v1:daily:' + day,
          JSON.stringify({seed: day, index: roundCount, answers, draft: []}));
      }, {game, perfect});
      await page.reload();
      await page.locator('.daily-rank').getByText(perfect
        ? /You (scored higher than|placed ahead of) 100%/
        : /First finisher today/).waitFor();
      if (perfect) assert.equal(await page.locator('#round-title').innerText(), game === 'maprot' ? '0 km off' : '5 out of 5');
      await page.close();
    }
  }
  console.log('Daily rankings passed for all seven games, including reloads, skips, and replayed submissions');
} finally {
  await browser.close();
}
