export const extraGames: readonly string[] = ["ladderrot", "cluerot"];
export const lowerIsBetter = (game: string) =>
  game === "maprot" || extraGames.includes(game);

export const maxScore = 2_147_483_647;

export function extraScoreLabel(game: string, score: number | null) {
  if (score === null) return "Answer shown";
  if (game === "scalerot")
    return `${score === maxScore ? "≥" : ""}${(score / 100).toLocaleString("en", { maximumFractionDigits: 2 })}% off`;
  const unit = game === "cluerot" ? "clue" : "move";
  return `${score} ${unit}${score === 1 ? "" : "s"}`;
}
