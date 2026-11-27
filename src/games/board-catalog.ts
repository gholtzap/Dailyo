export const boardGames = [
  { id: "path", name: "Path", description: "Connect every square in one path" },
  {
    id: "crowns",
    name: "Crowns",
    description: "Place one crown in every region",
  },
  {
    id: "wordgrid",
    name: "Word grid",
    description: "Swap letters to complete six words",
  },
  {
    id: "crossword",
    name: "Mini crossword",
    description: "Solve a small crossing-word puzzle",
  },
  { id: "groups", name: "Groups", description: "Find four hidden connections" },
  {
    id: "sudoku",
    name: "Mini Sudoku",
    description: "Complete a six-by-six Sudoku",
  },
] as const;
export type BoardGame = (typeof boardGames)[number]["id"];
