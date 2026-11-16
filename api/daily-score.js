import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createRouter, MAX_GUESSES, transition} from '../dist/router.js';
import {dailyDate, dailyChallenge, quizDeck, quizOptions, quizPuzzle, trainPuzzle} from '../dist/daily/puzzles.js';

const games = ['train', 'flags', 'languages', 'vocabulary'];
const data = new Map();
let pool;
let train;

function readData(path) {
  if (!data.has(path)) data.set(path, JSON.parse(readFileSync(new URL('../dist/' + path, import.meta.url))));
  return data.get(path);
}

function grade(puzzle, game, day, answers) {
  if (game === 'train') {
    if (!train) {
      const network = readData('data/network.json');
      train = {network, challenges: readData('data/challenges.json'), router: createRouter(network)};
    }
    const {network, challenges, router} = train;
    const challenge = dailyChallenge(challenges, day);
    if (puzzle !== trainPuzzle(network, challenge) || answers.length < 1 || answers.length > MAX_GUESSES) return;
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

  const items = readData('games/data/' + game + '.json');
  const deck = quizDeck(items, game, day);
  if (puzzle !== quizPuzzle(deck) || answers.length !== deck.length) return;
  let score = 0;
  for (const [index, item] of deck.entries()) {
    const options = quizOptions(items, game, item, `daily:${game}:${day}:${index}`);
    if (!options.some(option => option.id === answers[index])) return;
    if (answers[index] === item.id) score++;
  }
  return score;
}

export default async function handler(req, res) {
  const reply = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(405, {error: 'Use POST'});
  }
  if (!process.env.DATABASE_URL) return reply(404, {error: 'Rankings disabled'});
  if (req.headers['sec-fetch-site'] === 'cross-site') return reply(403, {error: 'Cross-site request'});
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') return reply(415, {error: 'Expected JSON'});
  if (Number(req.headers['content-length']) > 4096) return reply(413, {error: 'Result too large'});

  const {game, day, puzzle, answers} = req.body ?? {};
  if (!games.includes(game) || day !== dailyDate() || typeof puzzle !== 'string' || !Array.isArray(answers)) {
    return reply(400, {error: 'Expected a result for today’s puzzle'});
  }

  try {
    const score = grade(puzzle, game, day, answers);
    if (!Number.isInteger(score)) return reply(400, {error: 'Invalid daily result'});

    const cookie = req.headers.cookie?.match(/(?:^|;\s*)dailyo_player=([a-f0-9-]{36})(?:;|$)/)?.[1];
    const player = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(cookie ?? '') ? cookie : randomUUID();
    if (player !== cookie) {
      const secure = process.env.VERCEL === '1' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `dailyo_player=${player}; Path=/api; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
    }

    if (!pool) {
      pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000});
      pool.on('error', logPoolError);
    }
    const key = [game, day, puzzle, player];
    await pool.query(`
      INSERT INTO daily_scores (game, day, puzzle, player, score) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING`, [...key, score]);
    const {rows: [rank]} = await pool.query(`
      SELECT mine.score,
        count(*) FILTER (WHERE other.score < mine.score)::int AS "lower",
        count(*) FILTER (WHERE other.score = mine.score)::int AS tied,
        count(other.player)::int AS others
      FROM daily_scores mine
      LEFT JOIN daily_scores other
        ON (other.game, other.day, other.puzzle) = (mine.game, mine.day, mine.puzzle) AND other.player <> mine.player
      WHERE (mine.game, mine.day, mine.puzzle, mine.player) = ($1, $2, $3, $4)
      GROUP BY mine.score`, key);
    return reply(200, rank);
  } catch (error) {
    console.error('Daily score failed', error.code ?? error.name);
    return reply(503, {error: 'Daily ranking unavailable'});
  }
}

function logPoolError(error) {
  console.error('Daily score database connection failed', error.code ?? error.name);
}
