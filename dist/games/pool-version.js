// Keep already-issued Daily puzzles and dated Rush decks intact across this expansion.
// Append new rows after these original prefixes. Practice uses the complete pool now.
const originalSizes = { ladderrot: 29, skyrot: 12, skylinerot: 12, zoomrot: 11 };
export function releasedPool(game, rows, seed) {
    const date = /^(?:rush:[a-z]+:)?(\d{4}-\d{2}-\d{2})(?::\d+)?$/.exec(seed)?.[1];
    const size = originalSizes[game];
    return size && date && date <= '2026-11-18' ? rows.slice(0, size) : rows;
}
//# sourceMappingURL=pool-version.js.map