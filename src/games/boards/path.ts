import { hash } from "../../daily/puzzles.js";
export interface PathPuzzle {
  kind: "path";
  size: number;
  solution: number[];
  checkpoints: number[];
}
export function makePath(seed: string): PathPuzzle {
  const size = 5;
  let state = hash(seed);
  const random = (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % n;
  };
  let route = Array.from(
    { length: size * size },
    (_, i) =>
      Math.floor(i / size) * size +
      (Math.floor(i / size) % 2 ? size - 1 - (i % size) : i % size),
  );
  const adjacent = (a: number, b: number) =>
    Math.abs(Math.floor(a / size) - Math.floor(b / size)) +
      Math.abs((a % size) - (b % size)) ===
    1;
  // Backbite moves preserve a complete Hamiltonian path while changing its shape.
  for (let turn = 0; turn < 160; turn++) {
    if (random(2)) route.reverse();
    const neighbors = route
      .map((cell, i) => ({ cell, i }))
      .filter(({ cell, i }) => i > 1 && adjacent(route[0], cell));
    if (!neighbors.length) continue;
    const { i } = neighbors[random(neighbors.length)];
    route = [...route.slice(0, i).reverse(), ...route.slice(i)];
  }
  return {
    kind: "path",
    size,
    solution: route,
    checkpoints: [0, 4, 8, 12, 16, 20, 24].map((i) => route[i]),
  };
}
export function pathStep(
  p: PathPuzzle,
  route: number[],
  cell: number,
): number[] {
  if (!Number.isInteger(cell) || cell < 0 || cell >= p.size * p.size)
    return route;
  if (!route.length) return cell === p.checkpoints[0] ? [cell] : route;
  const prior = route.indexOf(cell);
  if (prior >= 0) return route.slice(0, prior + 1);
  const last = route.at(-1)!;
  if (
    Math.abs(Math.floor(last / p.size) - Math.floor(cell / p.size)) +
      Math.abs((last % p.size) - (cell % p.size)) !==
    1
  )
    return route;
  const checkpoint = p.checkpoints.indexOf(cell);
  const reached = route.filter((x) => p.checkpoints.includes(x)).length;
  if (checkpoint >= 0 && checkpoint !== reached) return route;
  if (cell === p.checkpoints.at(-1) && route.length !== p.size * p.size - 1)
    return route;
  return [...route, cell];
}
export function pathSolved(p: PathPuzzle, route: number[]): boolean {
  if (route.length !== p.size * p.size || new Set(route).size !== route.length)
    return false;
  let replay: number[] = [];
  for (const cell of route) {
    const next = pathStep(p, replay, cell);
    if (next.length !== replay.length + 1) return false;
    replay = next;
  }
  return p.checkpoints.every(
    (cell, i) =>
      i === 0 || route.indexOf(cell) > route.indexOf(p.checkpoints[i - 1]),
  );
}
