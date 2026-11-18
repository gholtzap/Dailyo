import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {admissionKey, browserOriginAllowed, burstRetryAfter, clientNetwork, cookieIdentity, playerCookie, readScoreBody} from '../lib/score-protection.js';
import handler from '../api/daily-score.js';

const secret = 'migration-test-secret-at-least-32-characters';

test('signed player identities reject tampering and preserve legacy migration', () => {
  const player = randomUUID();
  const cookie = playerCookie(player, secret);
  assert.deepEqual(cookieIdentity(cookie, secret), {player});
  assert.deepEqual(cookieIdentity(cookie, secret + 'changed'), {});
  assert.deepEqual(cookieIdentity(cookie.replace(player, randomUUID()), secret), {});
  assert.deepEqual(cookieIdentity(`dailyo_player=${player}`, secret), {legacy: player});
  assert.deepEqual(cookieIdentity(undefined, secret), {});
  assert.deepEqual(cookieIdentity(`dailyo_player=${player}.invalid.extra`, secret), {});
});

test('burst limits reset with the minute and network admission keys rotate hourly', () => {
  const now = 60_000;
  for (let i = 0; i < 120; i++) assert.equal(burstRetryAfter('test-network', now), 0);
  assert.equal(burstRetryAfter('test-network', now), 60);
  assert.equal(burstRetryAfter('test-network', now + 60_000), 0);
  assert.notEqual(admissionKey(secret, 1, 'test-network'), admissionKey(secret, 2, 'test-network'));
});

test('request parsing preserves JSON validation, body limits, and origin checks', async () => {
  const server = createServer(async (req, res) => {
    const body = await readScoreBody(req);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({body, allowed: browserOriginAllowed(req), network: clientNetwork(req)}));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const post = (body: string, headers: Record<string, string> = {}) => fetch(base, {method: 'POST', headers, body});
    const valid = await post('{"answers":[1,"a",null]}', {Origin: base});
    assert.deepEqual(await valid.json(), {body: {body: {answers: [1, 'a', null]}}, allowed: true, network: '127.0.0.1'});
    const invalid = await post('{', {Origin: 'https://another.example'});
    assert.deepEqual(await invalid.json(), {body: {status: 400}, allowed: false, network: '127.0.0.1'});
    const oversized = await post('x'.repeat(4097));
    const parsed = await oversized.json() as {body: {status: number}};
    assert.equal(parsed.body.status, 413);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('the TypeScript API rejects malformed payloads before using the database', async () => {
  const oldDatabase = process.env.DATABASE_URL;
  const oldSecret = process.env.DAILY_SCORE_SECRET;
  process.env.DATABASE_URL = 'postgres://unused-for-invalid-submissions';
  process.env.DAILY_SCORE_SECRET = secret;
  const server = createServer((req, res) => {void handler(req, res);});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(base)).status, 405);
    for (const body of ['null', '[]', '"text"', '{}', '{"game":"train","answers":[{}]}', '{']) {
      const response = await fetch(base, {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
      assert.equal(response.status, 400, body);
    }
    assert.equal((await fetch(base, {method: 'POST', body: '{}'})).status, 415);
    assert.equal((await fetch(base, {method: 'POST', headers: {Origin: 'https://another.example'}, body: '{}'})).status, 403);
  } finally {
    if (oldDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDatabase;
    if (oldSecret === undefined) delete process.env.DAILY_SCORE_SECRET; else process.env.DAILY_SCORE_SECRET = oldSecret;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
