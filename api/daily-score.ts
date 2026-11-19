import type {WorldCity} from '../src/types.js';
import {visualGames, isVisualGame, prepareVisual, visualSet, visualPuzzle, gradeVisual} from '../src/games/visual-puzzles.js';
import type {VisualGame, VisualItem, VisualQuestion} from '../src/games/visual-puzzles.js';
import type {IncomingMessage, ServerResponse} from 'node:http';
import type {Network, Challenge, TrainState, DraftLeg, QuizItem, JsonValue, RankResponse} from '../src/types.js';
import type {ExtraData, ExtraPuzzle} from '../src/games/extra-types.js';
import type {RotData, RotQuestion, RotAnswer} from '../src/games/rot-types.js';
type CachedPuzzle = {id: string; questions: VisualQuestion[]} | {id: string; challenge: Challenge} | ExtraPuzzle | {id: string; questions: RotQuestion[]} | {id: string; deck: QuizItem[]};
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createRouter, MAX_GUESSES, transition} from '../src/router.js';
import {dailyDate, dailyChallenge, worldDailyChallenge, quizDeck, quizOptions, quizPuzzle, trainPuzzle} from '../src/daily/puzzles.js';
import {makeSet, preparePuzzles, rankingPuzzle, restoreSession, roundCount, scoreSet} from '../src/games/rot-puzzles.js';

import {
  admissionKey, browserOriginAllowed, burstRetryAfter, clientNetwork, cookieIdentity, playerCookie, readScoreBody,
} from '../lib/score-protection.js';
import {extraGames, extraPuzzle, lowerIsBetter, prepareExtra, replayExtra} from '../src/games/extra-puzzles.js';

const rotGames = ['maprot', 'yearrot', 'borderrot'];
const games = ['train', 'flags', 'languages', 'vocabulary', ...rotGames, ...extraGames, ...visualGames];
const data = new Map<string, Network | Challenge[] | QuizItem[] | JsonValue>();
const visualData = new Map<VisualGame,VisualItem[]>();
const rotData = new Map<string, RotData | ExtraData>();
const dailyPuzzles = new Map<string, {day: string; puzzle: CachedPuzzle}>();
let pool: pg.Pool;
let train: {network: Network; challenges: Challenge[]; router: ReturnType<typeof createRouter>} | undefined;
const worldTrains = new Map<string, {network: Network; challenges: Challenge[]; router: ReturnType<typeof createRouter>}>();
let lastAdmissionCleanup: number | undefined;

function readData<T = JsonValue>(path: string): T {
  if (!data.has(path)) data.set(path, JSON.parse(readFileSync(new URL('../dist/' + path, import.meta.url), 'utf8')));
  return data.get(path) as T;
}

function puzzleFor<T extends CachedPuzzle>(game: string, day: string, prepare: () => T): T {
  const cached = dailyPuzzles.get(game);
  if (cached?.day === day) return cached.puzzle as T;
  const puzzle = prepare();
  dailyPuzzles.set(game, {day, puzzle});
  return puzzle;
}

export function grade(puzzle: string, game: string, day: string, answers: JsonValue[]): number | undefined {
  if (isVisualGame(game)) {
    if (!visualData.has(game)) visualData.set(game,prepareVisual(game,readData(`games/data/${game}.json`)));
    const expected=puzzleFor(game,day,()=>{
      const questions=visualSet(game,visualData.get(game)!,day);
      return {id:visualPuzzle(questions),questions};
    });
    if(puzzle!==expected.id)return;
    return gradeVisual(game,expected.questions,answers);
  }
  if (game === 'train') {
    if (!train) {
      const network = readData<Network>('data/network.json');
      train = {network, challenges: readData<Challenge[]>('data/challenges.json'), router: createRouter(network)};
    }
    let selected = train;
    let city: WorldCity | undefined;
    let version: unknown;
    try { version = JSON.parse(puzzle)?.[0]; } catch { return; }
    if (typeof version === 'string' && version.startsWith('world-')) {
      city = readData<WorldCity[]>('world-data/cities.json').find(item => item.feedVersion === version);
      if (!city) return;
      if (!worldTrains.has(city.slug)) {
        if (worldTrains.size >= 3) worldTrains.delete(worldTrains.keys().next().value!);
        const original = city.slug === 'nyc' ? readData<Network>('data/network.json') : readData<Network>(`world-data/${city.slug}/network.json`);
        const network = {...original, metadata: {...original.metadata, feedVersion: city.feedVersion}};
        const challenges = city.slug === 'nyc' ? train.challenges : readData<Challenge[]>(`world-data/${city.slug}/challenges.json`);
        worldTrains.set(city.slug, {network, challenges, router: createRouter(network)});
      }
      selected = worldTrains.get(city.slug)!;
    }
    const {network, challenges, router} = selected;
    const {id, challenge} = puzzleFor(city ? `train-world:${city.slug}` : game, day, () => {
      const challenge = city ? worldDailyChallenge(challenges, day, city!.slug) : dailyChallenge(challenges, day);
      return {id: trainPuzzle(network, challenge), challenge};
    });
    if (puzzle !== id || answers.length < 1 || answers.length > MAX_GUESSES) return;
    let state: TrainState = {phase: 'planning', challenge, legs: []};
    for (const guess of answers) {
      if (!Array.isArray(guess) || !guess.length || guess.length > 6 || state.phase !== 'planning') return;
      const draft: DraftLeg[] = [];
      for (const leg of guess) {
        if (!leg || typeof leg !== 'object' || Array.isArray(leg) || typeof leg.route !== 'string' || !Object.hasOwn(network.routes, leg.route)) return;
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
    return state.phase === 'revealed' ? state.result?.score : undefined;
  }

  if (extraGames.includes(game)) {
    if (!rotData.has(game)) rotData.set(game, prepareExtra(game,
      game === 'swaprot' ? undefined : readData('games/data/' + game + '.json'),
      game === 'ladderrot' ? readData('games/data/ladder-words.json') : undefined));
    const expected = puzzleFor(game, day, () => extraPuzzle(game, rotData.get(game) as ExtraData, day));
    if (puzzle !== expected.id) return;
    const completed = replayExtra(game, expected, answers);
    if (completed?.phase === 'complete' && completed.score !== null) return completed.score;
    return;
  }

  const items = readData<JsonValue | QuizItem[]>('games/data/' + game + '.json');
  if (rotGames.includes(game)) {
    if (!rotData.has(game)) rotData.set(game, preparePuzzles(game, items as JsonValue));
    const prepared = rotData.get(game) as RotData;
    const {id, questions} = puzzleFor(game, day, () => {
      const questions = makeSet(game, prepared, day);
      return {id: rankingPuzzle(game, questions), questions};
    });
    if (puzzle !== id) return;
    const candidate = {seed: day, index: roundCount, answers: answers as RotAnswer[], draft: []};
    if (restoreSession(game, prepared, questions, candidate, day).index !== roundCount) return;
    return scoreSet(game, questions, answers as RotAnswer[]).total;
  }
  const {id, deck} = puzzleFor(game, day, () => {
    const deck = quizDeck(items as QuizItem[], game, day);
    return {id: quizPuzzle(deck), deck};
  });
  if (puzzle !== id || answers.length !== deck.length) return;
  let score = 0;
  for (const [index, item] of deck.entries()) {
    const options = quizOptions(items as QuizItem[], game, item, `daily:${game}:${day}:${index}`);
    if (!options.some(option => option.id === answers[index])) return;
    if (answers[index] === item.id) score++;
  }
  return score;
}

async function admitPlayer(secret: string, network: string, hour: number) {
  if (lastAdmissionCleanup !== hour) {
    await pool.query('DELETE FROM daily_score_admissions WHERE hour < $1', [hour - 1]);
    lastAdmissionCleanup = hour;
  }
  const {rowCount} = await pool.query(`
    INSERT INTO daily_score_admissions (hour, network, admitted) VALUES ($1, $2, 1)
    ON CONFLICT (hour, network) DO UPDATE SET admitted = daily_score_admissions.admitted + 1
      WHERE daily_score_admissions.admitted < 60
    RETURNING admitted`, [hour, admissionKey(secret, hour, network)]);
  return (rowCount ?? 0) > 0;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const reply = (status: number, body: RankResponse | {error: string}) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const throttle = (seconds: number) => {
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
      req.headers['content-encoding'] !== undefined && req.headers['content-encoding'] !== 'identity') {
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

  const body = parsed.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, {error: 'Expected a result object'});
  const {game, day, puzzle, answers} = body;
  if (typeof game !== 'string' || !games.includes(game) || typeof day !== 'string' || day !== dailyDate() || typeof puzzle !== 'string' || !Array.isArray(answers)) {
    return reply(400, {error: 'Expected a result for today’s puzzle'});
  }

  try {
    const score = grade(puzzle, game, day, answers);
    if (score === undefined || !Number.isInteger(score)) return reply(400, {error: 'Invalid daily result'});

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
    const {rows: [rank]} = await pool.query<RankResponse>(`
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
    logPoolError(error instanceof Error ? error : new Error('Daily score failed'));
    return reply(503, {error: 'Daily ranking unavailable'});
  }
}

function logPoolError(error: Error & {code?: string}) {
  console.error('Daily score database connection failed', error.code ?? error.name);
}
