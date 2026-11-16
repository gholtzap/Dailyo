CREATE TABLE IF NOT EXISTS daily_scores (
  game text NOT NULL,
  day date NOT NULL,
  puzzle text NOT NULL,
  player uuid NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  PRIMARY KEY (game, day, puzzle, player)
);

CREATE INDEX IF NOT EXISTS daily_scores_player_idx ON daily_scores (player);

CREATE TABLE IF NOT EXISTS daily_score_admissions (
  hour bigint NOT NULL,
  network text NOT NULL,
  admitted smallint NOT NULL CHECK (admitted BETWEEN 1 AND 60),
  PRIMARY KEY (hour, network)
);
