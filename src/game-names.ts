// Presentation names are separate from stable game IDs, URLs and saved scores.
const names: Record<string, string> = {
  wordgrid: "Word grid",
  crossword: "Mini crossword",
  groups: "Groups",
  path: "Path",
  crowns: "Crowns",
  train: "Subway",
  trainrot: "Subway",
  flags: "Flags",
  flagrot: "Flags",
  languages: "Languages",
  langrot: "Languages",
  vocabulary: "Words",
  maprot: "Cities",
  yearrot: "Timeline",
  borderrot: "Borders",
  ladderrot: "Word ladder",
  cluerot: "Clues",
  skyrot: "From above",
  pricerot: "Prices",
  skylinerot: "Skylines",
  zoomrot: "Close-up",
  orderrot: "Ordering",
};
export function gameName(id: string): string {
  return names[id.toLowerCase()] ?? id;
}
