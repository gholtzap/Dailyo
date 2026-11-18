import {worldDailyChallenge} from '../dist/world.js';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createRouter, MAX_GUESSES, transition} from '../dist/router.js';
import {dailyDate, dailyChallenge, quizDeck, quizOptions, quizPuzzle, trainPuzzle} from '../dist/daily/puzzles.js';
import {makeSet, preparePuzzles, rankingPuzzle, restoreSession, roundCount, scoreSet} from '../dist/games/rot-puzzles.js';

import {
  admissionKey, browserOriginAllowed, burstRetryAfter, clientNetwork, cookieIdentity, playerCookie, readScoreBody,
} from '../lib/score-protection.js';
import {extraGames, extraPuzzle, lowerIsBetter, prepareExtra, replayExtra} from '../dist/games/extra-puzzles.js';

const rotGames = ['maprot', 'yearrot', 'borderrot'];
const games = ['train', 'flags', 'languages', 'vocabulary', ...rotGames, ...extraGames];
const data = new Map();
const rotData = new Map();
const dailyPuzzles = new Map();
let pool;
let train;
const worldTrains = new Map();
let lastAdmissionCleanup;

function readData(path) {
  if (!data.has(path)) data.set(path, JSON.parse(readFileSync(new URL('../dist/' + path, import.meta.url))));
  return data.get(path);
}

function puzzleFor(game, day, prepare) {
  const cached = dailyPuzzles.get(game);
  if (cached?.day === day) return cached.puzzle;
  const puzzle = prepare();
  dailyPuzzles.set(game, {day, puzzle});
  return puzzle;
}

export function grade(puzzle, game, day, answers) {
  if (game === 'train') {
    if (!train) {
      const network = readData('data/network.json');
      train = {network, challenges: readData('data/challenges.json'), router: createRouter(network)};
    }
    let selected = train, city;
    let version;
    try { version = JSON.parse(puzzle)?.[0]; } catch { return; }
    if (typeof version === 'string' && version.startsWith('world-')) {
      city = readData('world-data/cities.json').find(item => item.feedVersion === version);
      if (!city) return;
      if (!worldTrains.has(city.slug)) {
        if (worldTrains.size >= 3) worldTrains.delete(worldTrains.keys().next().value);
        const original = city.slug === 'nyc' ? readData('data/network.json') : readData(`world-data/${city.slug}/network.json`);
        const network = {...original, metadata: {...original.metadata, feedVersion: city.feedVersion}};
        const challenges = city.slug === 'nyc' ? train.challenges : readData(`world-data/${city.slug}/challenges.json`);
        worldTrains.set(city.slug, {network, challenges, router: createRouter(network)});
      }
      selected = worldTrains.get(city.slug);
    }
    const {network, challenges, router} = selected;
    const {id, challenge} = puzzleFor(city ? `train-world:${city.slug}` : game, day, () => {
      const challenge = city ? worldDailyChallenge(challenges, day, city.slug) : dailyChallenge(challenges, day);
      return {id: trainPuzzle(network, challenge), challenge};
    });
    if (puzzle !== id || answers.length < 1 || answers.length > MAX_GUESSES) return;
    let state = {phase: 'planning', challenge, legs: []};
    for (const guess of answers) {
      if (!Array.isArray(guess) || !guess.length || guess.length > 6 || state.phase !== 'planning') return;
      const draft = [];
      for (const leg of guess) {
        if (!leg || typeof leg.route !== 'string' || !Object.hasOwn(network.routes, leg.route)) return;
        if (leg.to === undefined) draft.push({route: leg.route});
        else {
          if (typeof leg.to !== 'string' || !Object.hasOwn(network.stations, leg.to)) return;
          draft.push({route: leg.route, to: leg.to});
        }
      }
      const next = transition(state, {type: 'submit', draft}, router);
      if (next === state) return;
      state = next;
    }
    return state.phase === 'revealed' ? state.result.score : undefined;
  }

  if (extraGames.includes(game)) {
    if (!rotData.has(game)) rotData.set(game, prepareExtra(game,
      game === 'swaprot' ? undefined : readData('games/data/' + game + '.json'),
      game === 'ladderrot' ? readData('games/data/ladder-words.json') : undefined));
    const expected = puzzleFor(game, day, () => extraPuzzle(game, rotData.get(game), day));
    if (puzzle !== expected.id) return;
    const completed = replayExtra(game, expected, answers);
    if (completed?.phase === 'complete' && completed.score !== null) return completed.score;
    return;
  }

  const items = readData('games/data/' + game + '.json');
  if (rotGames.includes(game)) {
    if (!rotData.has(game)) rotData.set(game, preparePuzzles(game, items));
    const prepared = rotData.get(game);
    const {id, questions} = puzzleFor(game, day, () => {
      const questions = makeSet(game, prepared, day);
      return {id: rankingPuzzle(game, questions), questions};
    });
    if (puzzle !== id) return;
    const candidate = {seed: day, index: roundCount, answers, draft: []};
    if (restoreSession(game, prepared, questions, candidate, day).index !== roundCount) return;
    return scoreSet(game, questions, answers).total;
  }
  const {id, deck} = puzzleFor(game, day, () => {
    const deck = quizDeck(items, game, day);
    return {id: quizPuzzle(deck), deck};
  });
  if (puzzle !== id || answers.length !== deck.length) return;
  let score = 0;
  for (const [index, item] of deck.entries()) {
    const options = quizOptions(items, game, item, `daily:${game}:${day}:${index}`);
    if (!options.some(option => option.id === answers[index])) return;
    if (answers[index] === item.id) score++;
  }
  return score;
}

async function admitPlayer(secret, network, hour) {
  if (lastAdmissionCleanup !== hour) {
    await pool.query('DELETE FROM daily_score_admissions WHERE hour < $1', [hour - 1]);
    lastAdmissionCleanup = hour;
  }
  const {rowCount} = await pool.query(`
    INSERT INTO daily_score_admissions (hour, network, admitted) VALUES ($1, $2, 1)
    ON CONFLICT (hour, network) DO UPDATE SET admitted = daily_score_admissions.admitted + 1
      WHERE daily_score_admissions.admitted < 60
    RETURNING admitted`, [hour, admissionKey(secret, hour, network)]);
  return rowCount > 0;
}

export default async function handler(req, res) {
  const reply = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const throttle = seconds => {
    res.setHeader('Retry-After', String(seconds));
    return reply(429, {error: 'Too many score submissions'});
  };
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(405, {error: 'Use POST'});
  }
  if (!process.env.DATABASE_URL) return reply(404, {error: 'Rankings disabled'});
  const secret = process.env.DAILY_SCORE_SECRET;
  if (!secret || secret.length < 32) return reply(503, {error: 'Daily ranking unavailable'});
  if (!browserOriginAllowed(req)) return reply(403, {error: 'Cross-origin request'});
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json' ||
      ![undefined, 'identity'].includes(req.headers['content-encoding'])) {
    return reply(415, {error: 'Expected uncompressed JSON'});
  }
  const network = clientNetwork(req);
  if (!network) return reply(503, {error: 'Daily ranking unavailable'});
  const now = Date.now();
  const retry = burstRetryAfter(network, now);
  if (retry) return throttle(retry);
  const parsed = await readScoreBody(req);
  if (parsed.status === 413) return reply(413, {error: 'Result too large'});
  if (parsed.status === 400) return reply(400, {error: 'Invalid JSON'});

  const {game, day, puzzle, answers} = parsed.body ?? {};
  if (!games.includes(game) || day !== dailyDate() || typeof puzzle !== 'string' || !Array.isArray(answers)) {
    return reply(400, {error: 'Expected a result for today’s puzzle'});
  }

  try {
    const score = grade(puzzle, game, day, answers);
    if (!Number.isInteger(score)) return reply(400, {error: 'Invalid daily result'});

    if (!pool) {
      pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000});
      pool.on('error', logPoolError);
    }

    const identity = cookieIdentity(req.headers.cookie, secret);
    let player = identity.player;
    if (!player) {
      if (identity.legacy) {
        const existing = await pool.query('SELECT 1 FROM daily_scores WHERE player = $1 LIMIT 1', [identity.legacy]);
        if (existing.rowCount) player = identity.legacy;
      }
      if (!player) {
        const hour = Math.floor(now / 3_600_000);
        if (!await admitPlayer(secret, network, hour)) return throttle(3600 - Math.floor(now / 1000) % 3600);
        player = randomUUID();
      }
      res.setHeader('Set-Cookie', playerCookie(player, secret));
    }
    const key = [game, day, puzzle, player];
    await pool.query(`
      INSERT INTO daily_scores (game, day, puzzle, player, score) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING`, [...key, score]);
    const {rows: [rank]} = await pool.query(`
      SELECT mine.score,
        count(*) FILTER (WHERE CASE WHEN $5::boolean
          THEN other.score > mine.score ELSE other.score < mine.score END)::int AS "lower",
        count(*) FILTER (WHERE other.score = mine.score)::int AS tied,
        count(other.player)::int AS others
      FROM daily_scores mine
      LEFT JOIN daily_scores other
        ON (other.game, other.day, other.puzzle) = (mine.game, mine.day, mine.puzzle) AND other.player <> mine.player
      WHERE (mine.game, mine.day, mine.puzzle, mine.player) = ($1, $2, $3, $4)
      GROUP BY mine.score`, [...key, lowerIsBetter(game)]);
    return reply(200, rank);
  } catch (error) {
    console.error('Daily score failed', error.code ?? error.name);
    return reply(503, {error: 'Daily ranking unavailable'});
  }
}

function logPoolError(error) {
  console.error('Daily score database connection failed', error.code ?? error.name);
}
