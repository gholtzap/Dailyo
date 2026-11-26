// HTTP + real Postgres + independent worker processes. No production writes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { dailyDate, quizDeck, quizPuzzle } from "../dist/daily/puzzles.js";

const base = new URL(process.env.TRAINROT_TEST_URL);
const database = new URL(process.env.DATABASE_URL);
assert.equal(base.hostname, "127.0.0.1");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname));
const peer = new URL(base);
peer.port = String(Number(base.port) + 1);
const db = new pg.Client({ connectionString: database.href });
await db.connect();
const day = dailyDate();
const deck = quizDeck(
  JSON.parse(readFileSync("dist/games/data/flags.json")),
  "flags",
  day,
);
const body = {
  game: "flags",
  day,
  puzzle: quizPuzzle(deck),
  answers: deck.map((item) => item.id),
};
const post = (host, cookie, payload = body) =>
  fetch(new URL("/api/daily-score", host), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(payload),
  });
const maintenance = (token) =>
  fetch(new URL("/api/score-maintenance", base), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
const receipts = {};
try {
  const first = await post(base);
  assert.equal(first.status, 200);
  const cookie = first.headers.get("set-cookie").split(";")[0];
  const player = cookie.split("=")[1].split(".")[0];
  const original = await first.json();
  const snapshot = async () =>
    (
      await db.query(
        "SELECT score, rank_response, rank_expires_at::text, xmin::text FROM daily_scores WHERE player=$1",
        [player],
      )
    ).rows[0];
  const before = await snapshot();
  const competitor = await post(peer);
  assert.equal(competitor.status, 200);
  const competitorRank = await competitor.json();
  assert.equal(competitorRank.others, 1); // cache cannot leak across players
  const repeated = await Promise.all(
    Array.from({ length: 8 }, (_, i) => post(i % 2 ? peer : base, cookie)),
  );
  for (const response of repeated) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), original);
  }
  assert.deepEqual(await snapshot(), before); // no inserts, cache writes, or recalculation
  receipts.cache = { workers: 2, replays: repeated.length, rowUnchanged: true };

  await db.query(
    "UPDATE daily_scores SET rank_expires_at=clock_timestamp()-interval '1 second' WHERE player=$1",
    [player],
  );
  const refreshed = await post(peer, cookie, {
    ...body,
    answers: deck.map(() => "__invalid__"),
  });
  // Foreign options are rejected even if a cached score exists.
  assert.equal(refreshed.status, 400);
  const refreshes = await Promise.all([post(base, cookie), post(peer, cookie)]);
  for (const response of refreshes) {
    assert.equal(response.status, 200);
    const rank = await response.json();
    assert.equal(rank.others, 1);
    assert.equal(rank.score, 5);
  }
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM daily_scores WHERE player=$1",
        [player],
      )
    ).rows[0].n,
    1,
  );
  assert.notEqual((await snapshot()).rank_expires_at, before.rank_expires_at);
  // First score stays authoritative after expiration, even with a different valid result.
  await db.query(
    "UPDATE daily_scores SET score=4,rank_expires_at=clock_timestamp()-interval '1 second' WHERE player=$1",
    [player],
  );
  assert.equal((await (await post(base, cookie)).json()).score, 4);

  const { rows: networks } = await db.query(
    "SELECT DISTINCT network FROM daily_score_request_limits",
  );
  assert.equal(networks.length, 1);
  // Exercise rollover: earlier requests need not have created this minute's row.
  await db.query(
    "DELETE FROM daily_score_request_limits WHERE minute=date_trunc('minute',statement_timestamp())",
  );
  // Seed the current bucket just below capacity, then race two workers.
  // Retry near a minute boundary so the test does not depend on wall-clock luck.
  for (;;) {
    const {
      rows: [clock],
    } = await db.query(
      "SELECT extract(second FROM clock_timestamp())::float AS seconds",
    );
    if (clock.seconds > 58) {
      await new Promise((resolve) => setTimeout(resolve, 2100));
      continue;
    }
    await db.query(
      `INSERT INTO daily_score_request_limits (minute,network,requests)
       VALUES (date_trunc('minute',statement_timestamp()),$1,119)
       ON CONFLICT (minute,network) DO UPDATE SET requests=119`,
      [networks[0].network],
    );
    const responses = await Promise.all([
      post(base, cookie),
      post(peer, cookie),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 429]);
    assert.ok(
      Number(
        responses.find((r) => r.status === 429).headers.get("retry-after"),
      ) > 0,
    );
    break;
  }
  assert.equal(
    (
      await db.query(
        "SELECT max(requests)::int AS n FROM daily_score_request_limits",
      )
    ).rows[0].n,
    120,
  );
  receipts.sharedLimit = {
    workers: 2,
    remainingSlots: 1,
    statuses: [200, 429],
  };

  assert.equal((await maintenance()).status, 401);
  assert.equal((await maintenance("wrong")).status, 401);
  assert.equal(
    (await fetch(new URL("/api/score-maintenance", base), { method: "POST" }))
      .status,
    405,
  );
  const old = randomUUID(),
    edge = randomUUID();
  await db.query(
    `INSERT INTO daily_scores(game,day,puzzle,player,score) VALUES
    ('flags',$1::date-90,'old',$2,0),('flags',$1::date-89,'edge',$3,0)`,
    [day, old, edge],
  );
  await db.query(
    "INSERT INTO daily_score_request_limits VALUES (date_trunc('minute',clock_timestamp())-interval '3 minutes','old',1)",
  );
  await db.query(
    "INSERT INTO daily_score_admissions VALUES (floor(extract(epoch FROM clock_timestamp())/3600)::bigint-2,'old',1)",
  );
  const cleanup = await maintenance(process.env.CRON_SECRET);
  assert.equal(cleanup.status, 200);
  assert.deepEqual(await cleanup.json(), {
    deleted: { scores: 1, requests: 1, admissions: 1 },
  });
  assert.equal(
    (await db.query("SELECT 1 FROM daily_scores WHERE player=$1", [old]))
      .rowCount,
    0,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM daily_scores WHERE player=$1", [edge]))
      .rowCount,
    1,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM daily_scores WHERE player=$1", [player]))
      .rowCount,
    1,
  );
  assert.deepEqual(await (await maintenance(process.env.CRON_SECRET)).json(), {
    deleted: { scores: 0, requests: 0, admissions: 0 },
  });
  receipts.retention = {
    deletedDay90: true,
    keptDay89: true,
    unauthorizedRejected: true,
    repeatSafe: true,
  };

  // A failed shared limiter must not fall back to accepting requests.
  await db.query(
    "ALTER TABLE daily_score_request_limits RENAME TO unavailable_request_limits",
  );
  try {
    assert.equal((await post(peer, cookie)).status, 503);
  } finally {
    await db.query(
      "ALTER TABLE unavailable_request_limits RENAME TO daily_score_request_limits",
    );
  }
  receipts.databaseFailure = { status: 503 };
  mkdirSync("test-results/score-hardening", { recursive: true });
  writeFileSync(
    "test-results/score-hardening/receipt.json",
    JSON.stringify(
      {
        command:
          "DATABASE_URL=<disposable-loopback-db> node scripts/test-score-api.mjs",
        ...receipts,
      },
      null,
      2,
    ),
  );
  console.log(
    "Score hardening HTTP/Postgres checks passed:",
    JSON.stringify(receipts),
  );
} finally {
  await db.end();
}
