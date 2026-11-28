import type { DailyMessage } from "../types.js";

type Checkpoint = NonNullable<DailyMessage["save"]>;
type SavedProgress = Checkpoint &
  ({ phase: "playing" } | { phase: "complete"; result: string });
export type DailyProgress = Record<string, SavedProgress>;
const key = (day: string) => `dailyo:feed:v1:daily:${day}`;

export function unchanged(
  save: Checkpoint | undefined,
  day: string,
): save is Checkpoint {
  if (
    !save ||
    typeof save.key !== "string" ||
    save.key.length > 300 ||
    !/^(?:dailyo|trainrot)[-:]/.test(save.key) ||
    !save.key.endsWith(`:${day}`) ||
    (save.value !== null && typeof save.value !== "string")
  )
    return false;
  try {
    return localStorage.getItem(save.key) === save.value;
  } catch {
    return false;
  }
}

export function readProgress(day: string, version: string): DailyProgress {
  if (!version) return {};
  try {
    const saved = JSON.parse(localStorage.getItem(key(day)) ?? "null");
    if (
      saved?.protocol !== 2 ||
      saved.version !== version ||
      !saved.games ||
      typeof saved.games !== "object"
    )
      return {};
    const games: DailyProgress = {};
    for (const [id, value] of Object.entries(saved.games)) {
      const entry = value as SavedProgress;
      if (
        (entry?.phase === "playing" ||
          (entry?.phase === "complete" &&
            typeof entry.result === "string" &&
            entry.result.length < 1000)) &&
        unchanged(entry, day)
      )
        games[id] = entry;
    }
    return games;
  } catch {
    return {};
  }
}

export function saveProgress(
  day: string,
  version: string,
  games: DailyProgress,
) {
  if (!version) return;
  try {
    localStorage.setItem(
      key(day),
      JSON.stringify({ protocol: 2, version, games }),
    );
  } catch {}
}
