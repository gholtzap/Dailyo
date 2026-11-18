let dailyFormatter;
export function dailyDate() {
    dailyFormatter ??= new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return dailyFormatter.format(new Date());
}
export function rushDate(value, today = dailyDate()) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today)
        return today;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : today;
}
export function hash(value) {
    let h = 2166136261;
    for (const char of value)
        h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
    return h || 1;
}
export function shuffle(list, seed) {
    let h = hash(seed);
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
        h ^= h << 13;
        h ^= h >>> 17;
        h ^= h << 5;
        const j = (h >>> 0) % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
export function seededDeck(seed, pool) {
    let hash = 2166136261;
    for (const char of seed)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const deck = [...pool];
    for (let i = deck.length - 1; i > 0; i--) {
        hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
        const j = hash % (i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
// Preserve already-issued daily journeys before expanding the rotation.
export function dailyChallenge(challenges, date) {
    const pinned = challenges.filter(challenge => challenge.daily === true);
    const easy = challenges.filter(challenge => challenge.difficulty === 'easy');
    const previous = date <= '2026-11-14' && pinned.length;
    const deck = seededDeck(previous ? 'trainrot-daily-v2' : 'trainrot-daily-v3', previous ? pinned : easy.length ? easy : challenges);
    const day = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
    return deck[((day % deck.length) + deck.length) % deck.length];
}
export function quizOptions(items, kind, item, seed) {
    if (kind === 'vocabulary') {
        const distractors = item.distractors.map((name, index) => ({ id: `${item.id}:${index + 1}`, name }));
        return shuffle([item, ...distractors], `${seed}:order`);
    }
    const sameFlags = [['id', 'mc'], ['ro', 'td'], ['au', 'hm'], ['bq', 'nl'], ['bv', 'no', 'sj'], ['fr', 'gf', 'gp', 'yt', 're', 'bl', 'mf', 'pm', 'wf'], ['sh', 'gb'], ['um', 'us'], ['fi', 'ax']];
    const incompatible = sameFlags.find(g => g.includes(item.id)) ?? [];
    const others = shuffle(items.filter(x => x.id !== item.id && !incompatible.includes(x.id)), `${seed}:options`).slice(0, 3);
    return shuffle([item, ...others], `${seed}:order`);
}
export const quizDeck = (items, kind, day) => shuffle(items, `daily:${kind}:${day}`).slice(0, 5);
export const quizPuzzle = (deck) => JSON.stringify(deck.map(item => item.id));
export const trainPuzzle = (network, challenge) => JSON.stringify([network.metadata.feedVersion, challenge.from, challenge.to]);
//# sourceMappingURL=puzzles.js.map