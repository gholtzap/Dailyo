import { shuffle } from './rot-puzzles.js';
export const extraGames = ['ladderrot', 'cluerot', 'scalerot', 'swaprot'];
export const lowerIsBetter = (game) => game === 'maprot' || extraGames.includes(game);
const letters = /^[a-z]{4}$/;
const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());
const normalized = (value) => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
const oneLetter = (from, to) => [...from].filter((letter, index) => letter !== to[index]).length === 1;
const sorted = [1, 2, 3, 4, 5, 6, 7];
const ordered = (board) => board.every((tile, index) => tile === sorted[index]);
const inversions = (board) => board.reduce((count, tile, i) => count + board.slice(i + 1).filter(next => next < tile).length, 0);
export const moveLimit = 100;
const maxScore = 2_147_483_647;
function shortest(buckets, start, goal) {
    const queue = new Map([[start, null]]);
    for (const word of queue.keys()) {
        for (let i = 0; i < 4; i++) {
            const key = word.slice(0, i) + '*' + word.slice(i + 1);
            const neighbors = buckets.get(key);
            if (!neighbors)
                continue;
            for (const next of neighbors)
                if (!queue.has(next))
                    queue.set(next, word);
        }
        if (queue.has(goal)) {
            const path = [];
            for (let next = goal; next !== null; next = queue.get(next))
                path.unshift(next);
            return path;
        }
    }
}
export function prepareExtra(game, raw, dictionary) {
    if (game === 'swaprot')
        return { game };
    if (!Array.isArray(raw) || raw.length < 5)
        throw new Error('Not enough puzzles');
    if (game === 'ladderrot') {
        if (!Array.isArray(dictionary) || !dictionary.length || !dictionary.every(word => typeof word === 'string' && letters.test(word))) {
            throw new Error('Invalid ladder dictionary');
        }
        const words = new Set(dictionary);
        if (!raw.every(row => Array.isArray(row) && row.length === 2 && row.every(word => typeof word === 'string' && words.has(word)) && row[0] !== row[1])) {
            throw new Error('Invalid word ladders');
        }
        const buckets = new Map();
        // Alphabetical neighbors preserve the existing tie-break between shortest paths.
        for (const word of [...words].sort()) {
            for (let i = 0; i < 4; i++) {
                const key = word.slice(0, i) + '*' + word.slice(i + 1);
                if (!buckets.has(key))
                    buckets.set(key, []);
                buckets.get(key).push(word);
            }
        }
        for (const [key, neighbors] of buckets)
            if (neighbors.length === 1)
                buckets.delete(key);
        return { game, rows: raw, words, buckets };
    }
    const valid = game === 'cluerot' ? raw.every(row => Array.isArray(row) && row.length === 3 &&
        nonempty(row[0]) && Array.isArray(row[1]) && row[1].length && row[1].every(nonempty) &&
        Array.isArray(row[2]) && row[2].length === 5 && row[2].every(nonempty)) :
        game === 'scalerot' && raw.every(row => Array.isArray(row) && row.length === 5 &&
            row.slice(0, 3).every(nonempty) && Number.isFinite(row[3]) && row[3] !== 0 && nonempty(row[4]));
    if (!valid)
        throw new Error('Invalid puzzle data');
    if (game === 'cluerot')
        return { game, rows: raw };
    return { game: 'scalerot', rows: raw };
}
export function extraPuzzle(game, data, seed) {
    if (data.game === 'swaprot') {
        let board = shuffle(sorted, seed);
        if (ordered(board))
            board = [board[1], board[0], ...board.slice(2)];
        return { game: 'swaprot', id: board.join(''), board, minimum: inversions(board) };
    }
    const day = /^\d{4}-\d{2}-\d{2}$/.test(seed) ? Date.parse(seed) / 86400000 : null;
    const row = Number.isInteger(day) ? data.rows[((day % data.rows.length) + data.rows.length) % data.rows.length] :
        shuffle(data.rows, seed)[0];
    if (data.game === 'ladderrot') {
        const [start, goal] = row;
        const solution = shortest(data.buckets, start, goal);
        if (!solution)
            throw new Error('Unsolvable ladder');
        return { game: data.game, id: `${start}-${goal}`, start, goal, words: data.words, solution };
    }
    if (data.game === 'cluerot') {
        const [answer, aliases, clues] = row;
        return { game: data.game, id: answer, answer, aliases: [answer, ...aliases].map(normalized), clues };
    }
    const [id, prompt, unit, actual, explanation] = row;
    return { game: 'scalerot', id, prompt, unit, actual, explanation };
}
export function initialExtra(game, puzzle) {
    const state = { phase: 'playing', moves: [], score: null, board: [], path: [], clue: 0 };
    if (puzzle.game === 'swaprot')
        state.board = puzzle.board;
    if (puzzle.game === 'ladderrot')
        state.path = [puzzle.start];
    if (game === 'cluerot')
        state.clue = 0;
    return state;
}
export function stepExtra(game, puzzle, state, move) {
    if (state.phase !== 'playing' || state.moves.length >= moveLimit)
        return state;
    if (typeof move !== 'string' && typeof move !== 'number' && move !== null)
        return state;
    const moves = [...state.moves, move];
    const finish = (score) => ({ ...state, phase: 'complete', moves, score });
    if (puzzle.game === 'scalerot') {
        if (typeof move !== 'number' || !Number.isFinite(move) || Math.abs(move) > 1e9)
            return state;
        return finish(Math.min(maxScore, Math.round(10000 * Math.abs(move - puzzle.actual) / Math.abs(puzzle.actual))));
    }
    if (puzzle.game === 'swaprot') {
        if (typeof move !== 'number' || !Number.isInteger(move) || move < 0 || move >= state.board.length - 1)
            return state;
        const board = [...state.board];
        [board[move], board[move + 1]] = [board[move + 1], board[move]];
        return ordered(board) ? { ...finish(moves.length), board } : { ...state, board, moves };
    }
    if (puzzle.game === 'ladderrot') {
        if (move === null)
            return finish(null);
        if (typeof move !== 'string' || !puzzle.words.has(move) || !oneLetter(state.path.at(-1), move) ||
            state.path.includes(move))
            return state;
        const path = [...state.path, move];
        return move === puzzle.goal ? { ...finish(moves.length), path } : { ...state, moves, path };
    }
    if (puzzle.game !== 'cluerot')
        return state;
    if (move === null)
        return finish(null);
    if (move === '')
        return state.clue < puzzle.clues.length - 1 ? { ...state, moves, clue: state.clue + 1 } : state;
    if (typeof move !== 'string' || move.length > 80 || !normalized(move))
        return state;
    if (puzzle.aliases.includes(normalized(move)))
        return finish(state.clue + 1);
    return state.clue < puzzle.clues.length - 1 ? { ...state, moves, clue: state.clue + 1 } : finish(null);
}
export function replayExtra(game, puzzle, moves) {
    if (!Array.isArray(moves) || moves.length > moveLimit)
        return;
    let state = initialExtra(game, puzzle);
    for (const move of moves) {
        const next = stepExtra(game, puzzle, state, move);
        if (next === state)
            return;
        state = next;
    }
    return state;
}
export function extraScoreLabel(game, score) {
    if (score === null)
        return 'Answer shown';
    if (game === 'scalerot')
        return `${score === maxScore ? '≥' : ''}${(score / 100).toLocaleString('en', { maximumFractionDigits: 2 })}% off`;
    const unit = game === 'cluerot' ? 'clue' : 'move';
    return `${score} ${unit}${score === 1 ? '' : 's'}`;
}
//# sourceMappingURL=extra-puzzles.js.map