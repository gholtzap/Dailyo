// Keep already-issued Daily puzzles and dated Rush decks intact across this expansion.
// Append new rows after these original prefixes. Practice uses the complete pool now.
const originalSizes: Record<string, number> = {
  ladderrot: 29,
  skyrot: 12,
  skylinerot: 12,
  zoomrot: 11,
  pricerot: 12,
};
export function releasedPool<T>(game: string, rows: T[], seed: string): T[] {
  const legacyDate = /^(?:rush:[a-z]+:)?(\d{4}-\d{2}-\d{2})(?::\d+)?$/.exec(
    seed,
  )?.[1];
  // UUID runs predate this expansion but bypassed the older numeric-run rule.
  const date = /^(?:rush:[a-z]+:)?(\d{4}-\d{2}-\d{2})(?::[^:]+){0,2}$/.exec(
    seed,
  )?.[1];
  const size = originalSizes[game];
  const cutoff = game === "pricerot" ? "2026-11-26" : "2026-11-18";
  if (size && legacyDate && legacyDate <= cutoff) return rows.slice(0, size);
  // Content added after November 27 must not change already-issued puzzles.
  const novemberPools: Record<string, number> = {
    ladderrot: 129,
    maprot: 214,
    wordboards: 120,
    cluerot: 24,
    yearrot: 54,
    orderrot: 15,
  };
  if (novemberPools[game] && date && date <= "2026-11-27")
    return rows.slice(0, novemberPools[game]);
  return rows;
}
