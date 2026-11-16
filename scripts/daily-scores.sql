CREATE TABLE IF NOT EXISTS daily_scores (
  game text NOT NULL,
  day date NOT NULL,
  puzzle text NOT NULL,
  player uuid NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  PRIMARY KEY (game, day, puzzle, player)
);
