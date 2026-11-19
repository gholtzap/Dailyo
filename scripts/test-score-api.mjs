import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const database = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname), 'Use a disposable loopback database');
const base = new URL(process.env.TRAINROT_TEST_URL ?? 'http://127.0.0.1:4174');
assert.equal(base.hostname, '127.0.0.1');
const env = {...process.env, TRAINROT_TEST_URL: base.origin, PORT: base.port};
const db = new pg.Client({connectionString: database.href});
await db.connect();
let owned = false;
try {
  await db.query(readFileSync('scripts/daily-scores.sql', 'utf8'));
  const {rows: [row]} = await db.query('SELECT (SELECT count(*) FROM daily_scores) + (SELECT count(*) FROM daily_score_admissions) AS count');
  assert.equal(Number(row.count), 0, 'Start with an empty disposable scores database');
  owned = true;
  for (const test of ['score-protection', 'train-ranking']) {
    const server = spawn(process.execPath, ['scripts/test-score-server.mjs'], {env, stdio: ['ignore', 'pipe', 'inherit']});
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Score API startup timed out')), 10_000);
        const finish = action => {clearTimeout(timeout); action();};
        server.once('error', error => finish(() => reject(error)));
        server.once('exit', code => finish(() => reject(new Error(`Score API exited: ${code}`))));
        server.stdout.on('data', chunk => {if (String(chunk).includes('Disposable score API ready')) finish(resolve);});
      });
      const child = spawn(process.execPath, [`tests/${test}.mjs`], {env, stdio: 'inherit'});
      const [code] = await once(child, 'exit');
      assert.equal(code, 0, `${test} failed`);
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = once(server, 'exit');
        server.kill();
        await exited;
      }
      // Each scenario gets fresh process-local rate limits and an empty database.
      await db.query('TRUNCATE daily_scores, daily_score_admissions');
    }
  }
} finally {
  if (owned) await db.query('TRUNCATE daily_scores, daily_score_admissions');
  await db.end();
}
