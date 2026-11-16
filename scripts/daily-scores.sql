CREATE TABLE IF NOT EXISTS daily_scores (
  game text NOT NULL,
  day date NOT NULL,
  puzzle text NOT NULL,
  player uuid NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  PRIMARY KEY (game, day, puzzle, player)
);
