import { hash } from "../../daily/puzzles.js";
export interface CrownPuzzle {
  kind: "crowns";
  size: number;
  regions: number[];
  solution: number[];
}
export function crownSolutions(
  regions: number[],
  size: number,
  limit = 2,
): number[][] {
  const found: number[][] = [];
  function visit(
    row: number,
    path: number[],
    cols: Set<number>,
    used: Set<number>,
  ) {
    if (found.length >= limit) return;
    if (row === size) {
      found.push(path);
      return;
    }
    for (let col = 0; col < size; col++) {
      const cell = row * size + col,
        region = regions[cell];
      if (
        cols.has(col) ||
        used.has(region) ||
        (row > 0 && Math.abs(col - (path.at(-1)! % size)) <= 1)
      )
        continue;
      visit(
        row + 1,
        [...path, cell],
        new Set([...cols, col]),
        new Set([...used, region]),
      );
    }
  }
  visit(0, [], new Set(), new Set());
  return found;
}
export function crownsSolved(p: CrownPuzzle, cells: number[]): boolean {
  return (
    cells.length === p.size &&
    new Set(cells).size === p.size &&
    cells.every((c) => Number.isInteger(c) && c >= 0 && c < p.size * p.size) &&
    new Set(cells.map((c) => Math.floor(c / p.size))).size === p.size &&
    new Set(cells.map((c) => c % p.size)).size === p.size &&
    new Set(cells.map((c) => p.regions[c])).size === p.size &&
    cells.every((a) =>
      cells.every(
        (b) =>
          a === b ||
          Math.abs(Math.floor(a / p.size) - Math.floor(b / p.size)) > 1 ||
          Math.abs((a % p.size) - (b % p.size)) > 1,
      ),
    )
  );
}
export function makeCrowns(seed: string): CrownPuzzle {
  const size = 6;
  let state = hash(seed);
  const random = (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % n;
  };
  const permutations: number[][] = [];
  function place(cols: number[]) {
    if (cols.length === size) {
      permutations.push(cols);
      return;
    }
    for (let c = 0; c < size; c++)
      if (!cols.includes(c) && (!cols.length || Math.abs(c - cols.at(-1)!) > 1))
        place([...cols, c]);
  }
  place([]);
  for (let attempt = 0; attempt < 10000; attempt++) {
    const solution = permutations[random(permutations.length)].map(
      (col, row) => row * size + col,
    );
    const regions = Array(size * size).fill(-1);
    solution.forEach((cell, i) => (regions[cell] = i));
    let blank = size * size - size;
    while (blank) {
      const frontier: { cell: number; region: number }[] = [];
      for (let cell = 0; cell < regions.length; cell++)
        if (regions[cell] < 0) {
          const neighbors = [
            cell - size,
            cell + size,
            ...(cell % size ? [cell - 1] : []),
            ...(cell % size < size - 1 ? [cell + 1] : []),
          ].filter((x) => x >= 0 && x < size * size && regions[x] >= 0);
          for (const n of neighbors)
            frontier.push({ cell, region: regions[n] });
        }
      const move = frontier[random(frontier.length)];
      regions[move.cell] = move.region;
      blank--;
    }
    if (crownSolutions(regions, size).length === 1)
      return { kind: "crowns", size, regions, solution };
  }
  throw new Error("Could not construct a unique Crowns board");
}
