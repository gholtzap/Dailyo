import pg from "pg";
import type { RankResponse } from "../src/types.js";

let pool: pg.Pool | undefined;

export function scorePool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    pool.on("error", logScoreError);
  }
  return pool;
}

export function logScoreError(error: Error & { code?: string }) {
  console.error(
    "Daily score database request failed",
    error.code ?? error.name,
  );
}

// Database time and an atomic UPSERT make this limit shared across all workers.
export async function takeScoreRequest(network: string) {
  const { rowCount } = await scorePool().query(
    `
    INSERT INTO daily_score_request_limits (minute, network, requests)
      VALUES (date_trunc('minute', statement_timestamp()), $1, 1)
    ON CONFLICT (minute, network) DO UPDATE
      SET requests = daily_score_request_limits.requests + 1
      WHERE daily_score_request_limits.requests < 120
    RETURNING requests`,
    [network],
  );
  return (rowCount ?? 0) > 0;
}

export async function recordScore(
  key: [string, string, string, string],
  score: number,
  lowerIsBetter: boolean,
) {
  const {
    rows: [row],
  } = await scorePool().query<{ rank: RankResponse }>(
    "SELECT record_daily_score($1, $2, $3, $4, $5, $6) AS rank",
    [...key, score, lowerIsBetter],
  );
  return row.rank;
}

export async function cleanupScores() {
  // Keep today and the preceding 89 New York calendar dates. The daily job
  // also expires hashed request/admission counters without requiring traffic.
  const {
    rows: [counts],
  } = await scorePool().query<{
    scores: number;
    requests: number;
    admissions: number;
  }>(`
    WITH scores AS (
      DELETE FROM daily_scores
      WHERE day < (statement_timestamp() AT TIME ZONE 'America/New_York')::date - 89
      RETURNING 1
    ), requests AS (
      DELETE FROM daily_score_request_limits
      WHERE minute < date_trunc('minute', statement_timestamp()) - interval '2 minutes'
      RETURNING 1
    ), admissions AS (
      DELETE FROM daily_score_admissions
      WHERE hour < floor(extract(epoch FROM statement_timestamp()) / 3600)::bigint - 1
      RETURNING 1
    ) SELECT (SELECT count(*) FROM scores)::int AS scores,
      (SELECT count(*) FROM requests)::int AS requests,
      (SELECT count(*) FROM admissions)::int AS admissions`);
  return counts;
}
