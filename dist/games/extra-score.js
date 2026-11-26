export const extraGames = [
    "ladderrot",
    "cluerot",
    "scalerot",
    "swaprot",
];
export const lowerIsBetter = (game) => game === "maprot" || extraGames.includes(game);
export const maxScore = 2_147_483_647;
export function extraScoreLabel(game, score) {
    if (score === null)
        return "Answer shown";
    if (game === "scalerot")
        return `${score === maxScore ? "≥" : ""}${(score / 100).toLocaleString("en", { maximumFractionDigits: 2 })}% off`;
    const unit = game === "cluerot" ? "clue" : "move";
    return `${score} ${unit}${score === 1 ? "" : "s"}`;
}
//# sourceMappingURL=extra-score.js.map