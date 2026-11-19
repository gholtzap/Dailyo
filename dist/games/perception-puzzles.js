import { hash } from '../daily/puzzles.js';
export const perceptionGames = ['countrot', 'trackrot', 'anglerot', 'temporot', 'splitrot'];
export function perceptionPuzzle(game, seed, index, hard = false) {
    let state = hash(`perception:v1:${game}:${seed}:${index}:${hard}`);
    const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
    const start = .15 + random() * .7, velocity = hard ? (random() < .5 ? -1 : 1) * (1.3 + random()) : .1 + random() * .8 - start;
    const interval = 60000 / (75 + Math.floor(random() * 56));
    const right = random() < .5;
    const target = game === 'countrot' ? 12 + Math.floor(random() * 29) : game === 'trackrot' ? reflect(start + velocity) : game === 'anglerot' ? Math.floor(random() * 330) + 15 + (hard ? 360 : 0) : game === 'temporot' ? interval : (hard ? 1.1 + Math.floor(random() * 8) / 10 : .15 + Math.floor(random() * 14) / 20);
    // A shuffled grid gives every dot its own space, including at small screen sizes.
    const cells = Array.from({ length: 60 }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const dots = cells.slice(0, game === 'countrot' ? target : 0).map(i => ({ x: (i % 10 + .3 + random() * .4) / 10, y: (Math.floor(i / 10) + .3 + random() * .4) / 6, dx: (random() - .5) * .04, dy: (random() - .5) * .04 }));
    return { target, hard, right, dots, start, velocity, interval };
}
export function reflect(value) { const wrapped = ((value % 2) + 2) % 2; return wrapped <= 1 ? wrapped : 2 - wrapped; }
export function perceptionGrade(game, q, guess) {
    let error;
    if (game === 'temporot') {
        if (!Array.isArray(guess) || guess.length !== 8 || guess.some(x => !Number.isFinite(x)))
            return { points: 0, error: Infinity };
        error = guess.reduce((sum, tap, i) => sum + Math.abs(tap - (3 + (q.hard ? .5 : 1) + i) * q.interval), 0) / 8;
    }
    else {
        if (typeof guess !== 'number' || !Number.isFinite(guess))
            return { points: 0, error: Infinity };
        error = Math.abs(guess - q.target);
        if (game === 'anglerot' && !q.hard)
            error = Math.min(error % 360, 360 - error % 360);
    }
    const tolerance = game === 'countrot' ? q.target * .5 : game === 'trackrot' ? .4 : game === 'anglerot' ? (q.hard ? 180 : 90) : game === 'temporot' ? q.interval * .6 : .4;
    return { points: Math.max(0, Math.round(100 * (1 - error / tolerance))), error };
}
//# sourceMappingURL=perception-puzzles.js.map