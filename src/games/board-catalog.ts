export const boardGames = [
  { id: "path", name: "Path", description: "Connect every square in one path" },
] as const;
export type BoardGame = (typeof boardGames)[number]["id"];
