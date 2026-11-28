import { dailyDate } from "./daily/puzzles.js";

// Daily puzzles cannot be resumed after their date. Match server retention:
// keep today and the preceding 89 dates; never expire practice or other data.
export function pruneDailySaves(today = dailyDate()) {
  const cutoff = Date.parse(`${today}T00:00:00Z`) - 89 * 86_400_000;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      const match =
        /^(?:(?:dailyo|trainrot):[a-z]+:v\d+:daily:|dailyo:daily-feed:skipped:|(?:trainrot-daily-v2|trainrot-world-daily|last-stop-v1):.+:)(\d{4}-\d{2}-\d{2})$/.exec(
          key,
        );
      if (!match) continue;
      const date = Date.parse(`${match[1]}T00:00:00Z`);
      if (
        Number.isFinite(date) &&
        new Date(date).toISOString().slice(0, 10) === match[1] &&
        date < cutoff
      )
        localStorage.removeItem(key);
    }
  } catch {
    // Storage restrictions must not stop the games from loading.
  }
}
