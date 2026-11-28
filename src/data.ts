import type { JsonValue } from "./types.js";

type Preparation = "json" | "visual" | "rot" | "extra";
type Transport = () => Promise<Response>;
type Host = Window & { dailyoDataset?: typeof cachedDataset };
const datasets = new Map<string, Promise<unknown>>();

async function readDataset(
  path: string,
  preparation: Preparation,
  transport: Transport,
) {
  const response = await transport();
  if (!response.ok) throw new Error("Game data unavailable");
  // Parse in the host's realm so cached data does not retain a removed iframe.
  const raw = JSON.parse(await response.text()) as JsonValue;
  const game = path
    .split("/")
    .at(-1)!
    .replace(/\.json$/, "");
  if (preparation === "visual") {
    const { isVisualGame, prepareVisual } =
      await import("./games/visual-puzzles.js");
    if (!isVisualGame(game)) throw new Error("Unknown visual game");
    return prepareVisual(game, raw);
  }
  if (preparation === "rot") {
    const { preparePuzzles } = await import("./games/rot-puzzles.js");
    return preparePuzzles(game, raw);
  }
  if (preparation === "extra") {
    const { prepareExtra } = await import("./games/extra-puzzles.js");
    const dictionary =
      game === "ladderrot"
        ? await cachedDataset("/games/data/ladder-words.json", "json")
        : undefined;
    return prepareExtra(game, raw, dictionary as JsonValue);
  }
  return raw;
}

function cachedDataset(
  path: string,
  preparation: Preparation = "json",
  transport: Transport = () => fetch(path),
): Promise<unknown> {
  const key = `${preparation}:${path}`;
  const saved = datasets.get(key);
  if (saved) return saved;
  const pending = readDataset(path, preparation, transport).catch((error) => {
    if (datasets.get(key) === pending) datasets.delete(key);
    throw error;
  });
  // One host page owns at most 32 datasets; navigation clears the cache.
  if (datasets.size >= 32) datasets.delete(datasets.keys().next().value!);
  datasets.set(key, pending);
  return pending;
}

export function enableDatasetCache() {
  (window as Host).dailyoDataset = cachedDataset;
}

export function loadDataset<T = JsonValue>(
  path: string,
  preparation: Preparation = "json",
): Promise<T> {
  let host: Host = window;
  try {
    if (
      window.parent !== window &&
      window.parent.location.origin === location.origin
    )
      host = window.parent as Host;
  } catch {}
  // Let the first child reuse its HTML preload. Preparation and cache ownership
  // stay in the host; later rounds share the same in-flight or fulfilled promise.
  return (
    host.dailyoDataset
      ? host.dailyoDataset(path, preparation, () => fetch(path))
      : readDataset(path, preparation, () => fetch(path))
  ) as Promise<T>;
}
