import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createRouter} from '../dist/router.js';
import {dailyChallenge, dailyDate, trainPuzzle} from '../dist/daily/puzzles.js';

const base = process.env.TRAINROT_TEST_URL;
assert.ok(base && process.env.DATABASE_URL, 'Use a loopback score API and disposable Postgres database.');
assert.equal(new URL(base).hostname, '127.0.0.1');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const network = JSON.parse(readFileSync(new URL('../dist/data/network.json', import.meta.url)));
const challenges = JSON.parse(readFileSync(new URL('../dist/data/challenges.json', import.meta.url)));
const day = dailyDate(), challenge = dailyChallenge(challenges, day);
const draft = createRouter(network).best(challenge.from, challenge.to).legs.map(({route}) => ({route}));
const body = {game: 'train', day, puzzle: trainPuzzle(network, challenge), answers: [draft]};
const post = (payload, cookie) => fetch(base + '/api/daily-score', {
  method: 'POST', headers: {'Content-Type': 'application/json', Origin: base, ...(cookie ? {Cookie: cookie} : {})}, body: JSON.stringify(payload),
});
const db = new pg.Client({connectionString: process.env.DATABASE_URL});
await db.connect();
try {
  const first = await post(body);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).score, 100);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const player = cookie.split('=')[1].split('.')[0];
  const repeated = await Promise.all(Array.from({length: 4}, () => post(body, cookie)));
  for (const response of repeated) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).score, 100);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await post({...body, answers: [draft, draft]}, cookie)).status, 400);
  assert.equal((await post({...body, puzzle: body.puzzle + 'changed'}, cookie)).status, 400);
  const {rows} = await db.query('SELECT score FROM daily_scores WHERE game=$1 AND day=$2 AND puzzle=$3 AND player=$4', ['train', day, body.puzzle, player]);
  assert.deepEqual(rows, [{score: 100}]);
  console.log('Train score API: generated lifecycle replay, concurrent idempotency, terminal-answer rejection, and one persisted result passed.');
} finally {await db.end();}
