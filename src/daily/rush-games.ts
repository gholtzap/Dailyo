export const individualRushGames = [
  { label: "flagrot", path: "/flags/", seconds: [8, 6, 4] },
  { label: "langrot", path: "/languages/", seconds: [8, 6, 4] },
  { label: "trainrot", path: "/trainrot/", seconds: [35, 28, 21] },
  { label: "Vocabulary", path: "/vocabulary/", seconds: [12, 9, 6] },
  { label: "maprot", path: "/maprot/", seconds: [20, 15, 10] },
  { label: "yearrot", path: "/yearrot/", seconds: [14, 10, 6] },
  { label: "borderrot", path: "/borderrot/", seconds: [45, 35, 25] },
  { label: "skyrot", path: "/skyrot/", seconds: [16, 12, 8] },
  { label: "pricerot", path: "/pricerot/", seconds: [18, 14, 10] },
  { label: "skylinerot", path: "/skylinerot/", seconds: [12, 9, 6] },
  { label: "zoomrot", path: "/zoomrot/", seconds: [12, 9, 6] },
  { label: "orderrot", path: "/orderrot/", seconds: [25, 20, 15] },
];

// Mixed Rush favors quick recognition and short inputs over multi-step puzzles.
export const rushGames = individualRushGames.filter((game) =>
  [
    "flagrot",
    "langrot",
    "Vocabulary",
    "yearrot",
    "skyrot",
    "pricerot",
    "skylinerot",
    "zoomrot",
  ].includes(game.label),
);
