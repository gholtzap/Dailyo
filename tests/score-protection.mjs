import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {request} from 'node:http';
import pg from 'pg';
import {dailyDate, quizDeck, quizPuzzle} from '../dist/daily/puzzles.js';

const base = process.env.TRAINROT_TEST_URL;
assert.ok(base && process.env.DATABASE_URL, 'Use a disposable scores database and local server.');
assert.equal(new URL(base).hostname, '127.0.0.1', 'Rate-limit checks run only on loopback.');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),
  'Use a loopback Postgres database for rate-limit testing.');
const db = new pg.Client({connectionString: process.env.DATABASE_URL});
await db.connect();
try {
  const {rowCount} = await db.query('SELECT 1 FROM daily_scores LIMIT 1');
  assert.equal(rowCount, 0, 'Start with an empty test database.');
  const day = dailyDate();
  const items = JSON.parse(readFileSync(new URL('../dist/games/data/flags.json', import.meta.url)));
  const deck = quizDeck(items, 'flags', day);
  const puzzle = quizPuzzle(deck);
  const body = {game: 'flags', day, puzzle, answers: deck.map(item => item.id)};
  const headers = {'Content-Type': 'application/json', Origin: base};
  const post = (content = body, extra = {}) => fetch(base + '/api/daily-score', {
    method: 'POST', headers: {...headers, ...extra},
    body: typeof content === 'string' ? content : JSON.stringify(content),
  });
  assert.equal((await post(body, {Origin: 'https://foreign.example'})).status, 403);
  assert.equal((await post(body, {'Sec-Fetch-Site': 'same-site'})).status, 403);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post(' '.repeat(4097))).status, 413);
  const chunked = await new Promise((resolve, reject) => {
    const req = request(base + '/api/daily-score', {method: 'POST', headers}, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.write(' '.repeat(3000));
    req.end(' '.repeat(1500));
  });
  assert.equal(chunked, 413);
  assert.equal((await post(body, {'Content-Encoding': 'gzip'})).status, 415);
  assert.equal((await post({...body, answers: []})).status, 400);

  const legacy = randomUUID();
  await db.query('INSERT INTO daily_scores (game, day, puzzle, player, score) VALUES ($1,$2,$3,$4,$5)',
    ['flags', day, puzzle, legacy, 4]);
  const migrated = await post(body, {Cookie: 'dailyo_player=' + legacy});
  assert.equal(migrated.status, 200);
  assert.equal((await migrated.json()).score, 4);
  const cookie = migrated.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('dailyo_player=' + legacy + '.'));
  assert.equal((await post(body, {Cookie: cookie})).headers.get('set-cookie'), null);

  const chosen = randomUUID();
  const first = await post(body, {Cookie: 'dailyo_player=' + chosen});
  assert.equal(first.status, 200);
  const newCookie = first.headers.get('set-cookie').split(';')[0];
  assert.ok(!newCookie.includes(chosen));
  assert.equal((await db.query('SELECT 1 FROM daily_scores WHERE player = $1', [chosen])).rowCount, 0);
  const altered = newCookie.replace(/\.[^.]/, match => match === '.a' ? '.b' : '.a');
  const replaced = await post(body, {Cookie: altered});
  assert.equal(replaced.status, 200);
  assert.notEqual(replaced.headers.get('set-cookie').split(';')[0], newCookie);

  await db.query('UPDATE daily_score_admissions SET admitted = 59');
  const concurrent = await Promise.all([post(), post()]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 429]);
  assert.ok(concurrent.find(response => response.status === 429).headers.has('retry-after'));
  assert.equal((await post(body, {Cookie: cookie})).status, 200);
  let throttled;
  for (let i = 0; i <= 120; i++) {
    const response = await post('{');
    if (response.status === 429) {
      throttled = response;
      break;
    }
    assert.equal(response.status, 400);
  }
  assert.ok(throttled?.headers.has('retry-after'));
  console.log('Score API protections passed, including legacy migration, concurrent admission and burst limits');
} finally {
  await db.end();
}
