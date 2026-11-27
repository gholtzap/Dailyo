export const boardGames = [
  {
    id: "wordgrid",
    name: "Word grid",
    description: "Swap letters to complete six words",
  },
  {
    id: "crowns",
    name: "Crowns",
    description: "Place one crown in every region",
  },
  { id: "path", name: "Path", description: "Connect every square in one path" },
] as const;
export type BoardGame = (typeof boardGames)[number]["id"];
