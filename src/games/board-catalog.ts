export const boardGames = [
  {
    id: "crowns",
    name: "Crowns",
    description: "Place one crown in every region",
  },
  { id: "path", name: "Path", description: "Connect every square in one path" },
] as const;
export type BoardGame = (typeof boardGames)[number]["id"];
