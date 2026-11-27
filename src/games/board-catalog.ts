export const boardGames = [
  {
    id: "sudoku",
    name: "Mini Sudoku",
    description: "Complete a six-by-six Sudoku",
  },
  { id: "groups", name: "Groups", description: "Find four hidden connections" },
  {
    id: "crossword",
    name: "Mini crossword",
    description: "Solve a small crossing-word puzzle",
  },
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
