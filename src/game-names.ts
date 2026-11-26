// Presentation names are separate from stable game IDs, URLs and saved scores.
const names: Record<string, string> = {
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
  scalerot: "Estimates",
  swaprot: "Sort",
  skyrot: "From above",
  pricerot: "Prices",
  skylinerot: "Skylines",
  zoomrot: "Close-up",
  orderrot: "Ordering",
  countrot: "Count",
  trackrot: "Track",
  anglerot: "Angles",
  temporot: "Rhythm",
  splitrot: "Split",
};
export function gameName(id: string): string {
  return names[id.toLowerCase()] ?? id;
}
