CREATE TABLE IF NOT EXISTS daily_scores (
  game text NOT NULL,
  day date NOT NULL,
  puzzle text NOT NULL,
  player uuid NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  PRIMARY KEY (game, day, puzzle, player)
);

CREATE INDEX IF NOT EXISTS daily_scores_player_idx ON daily_scores (player);
CREATE INDEX IF NOT EXISTS daily_scores_day_idx ON daily_scores (day);

ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS rank_response jsonb;
ALTER TABLE daily_scores ADD COLUMN IF NOT EXISTS rank_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS daily_score_admissions (
  hour bigint NOT NULL,
  network text NOT NULL,
  admitted smallint NOT NULL CHECK (admitted BETWEEN 1 AND 60),
  PRIMARY KEY (hour, network)
);

CREATE TABLE IF NOT EXISTS daily_score_request_limits (
  minute timestamptz NOT NULL,
  network text NOT NULL,
  requests smallint NOT NULL CHECK (requests BETWEEN 1 AND 120),
  PRIMARY KEY (minute, network)
);

-- The row lock coalesces concurrent refreshes across function instances.
-- A cached response always belongs to this exact browser and puzzle.
CREATE OR REPLACE FUNCTION record_daily_score(
  p_game text, p_day date, p_puzzle text, p_player uuid, p_score integer,
  p_lower_is_better boolean
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  saved daily_scores%ROWTYPE;
  ranking jsonb;
BEGIN
  SELECT * INTO saved FROM daily_scores
    WHERE (game, day, puzzle, player) = (p_game, p_day, p_puzzle, p_player)
    FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO daily_scores (game, day, puzzle, player, score)
      VALUES (p_game, p_day, p_puzzle, p_player, p_score)
      ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT saved FROM daily_scores
      WHERE (game, day, puzzle, player) = (p_game, p_day, p_puzzle, p_player)
      FOR UPDATE;
  END IF;

  IF saved.rank_expires_at > clock_timestamp() AND saved.rank_response IS NOT NULL THEN
    RETURN saved.rank_response;
  END IF;

  SELECT jsonb_build_object(
    'score', saved.score,
    'lower', count(*) FILTER (WHERE CASE WHEN p_lower_is_better
      THEN score > saved.score ELSE score < saved.score END),
    'tied', count(*) FILTER (WHERE score = saved.score),
    'others', count(*)
  ) INTO ranking FROM daily_scores
    WHERE (game, day, puzzle) = (p_game, p_day, p_puzzle) AND player <> p_player;

  UPDATE daily_scores SET rank_response = ranking,
    rank_expires_at = clock_timestamp() + interval '15 seconds'
    WHERE (game, day, puzzle, player) = (p_game, p_day, p_puzzle, p_player);
  RETURN ranking;
END;
$$;
