export const roundCount = 5;
export function shuffle(items, seed) {
    let hash = 2166136261;
    for (const character of seed)
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
        const j = hash % (i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
const isCoordinate = (point) => Array.isArray(point) && point.length === 2 &&
    point.every((value, index) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= [180, 90][index]);
const distinct = (values) => new Set(values).size === values.length;
export function distanceKm([lonA, latA], [lonB, latB]) {
    const radians = Math.PI / 180;
    const arc = Math.sin((latB - latA) * radians / 2) ** 2 +
        Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin((lonB - lonA) * radians / 2) ** 2;
    return Math.round(12_742 * Math.asin(Math.sqrt(Math.min(1, arc))));
}
const maxBorderCountries = 7;
function shortestRoutes(graph, start) {
    const routes = new Map([[start, [start]]]);
    for (const [country, path] of routes) {
        if (path.length === maxBorderCountries)
            continue;
        for (const neighbour of graph.get(country).neighbours) {
            if (!routes.has(neighbour))
                routes.set(neighbour, [...path, neighbour]);
        }
    }
    return routes;
}
export function preparePuzzles(kind, raw) {
    if (kind === 'maprot') {
        if (!raw || Array.isArray(raw) || typeof raw !== 'object' || typeof raw.land !== 'string' || !/^M[MLZ\d.,-]+$/.test(raw.land) ||
            !Array.isArray(raw.places) || raw.places.length < roundCount ||
            !raw.places.every(row => Array.isArray(row) && row.length === 4 &&
                row.slice(0, 2).every(value => typeof value === 'string' && value.trim()) &&
                isCoordinate(row.slice(2))))
            throw new Error('Invalid atlas');
        return { kind: 'maprot', land: raw.land, items: raw.places };
    }
    if (kind === 'yearrot') {
        if (!Array.isArray(raw) || raw.length < roundCount + 2 ||
            !raw.every(row => Array.isArray(row) && row.length === 2 && Number.isInteger(row[0]) &&
                typeof row[1] === 'string' && row[1].trim()) ||
            !distinct(raw.map(row => row[0])))
            throw new Error('Invalid timeline');
        return { kind: 'yearrot', items: raw };
    }
    if (kind !== 'borderrot' || !Array.isArray(raw) ||
        !raw.every(row => Array.isArray(row) && row.length === 3 && typeof row[0] === 'string' && /^[A-Z]{2}$/.test(row[0]) &&
            typeof row[1] === 'string' && row[1].trim() && Array.isArray(row[2]) && distinct(row[2]))) {
        throw new Error('Invalid land borders');
    }
    const rows = raw;
    const graph = new Map(rows.map(([id, name, neighbours]) => [id, { id, name, neighbours }]));
    if (graph.size !== raw.length || rows.some(([id, , neighbours]) => neighbours.some(next => next === id || !graph.get(next)?.neighbours.includes(id)))) {
        throw new Error('Invalid land borders');
    }
    const items = [];
    for (const country of graph.keys()) {
        for (const [target, route] of shortestRoutes(graph, country)) {
            if (country < target && route.length >= 4)
                items.push(route);
        }
    }
    if (items.length < roundCount)
        throw new Error('No land routes');
    return { kind: 'borderrot', graph, items };
}
export function makeSet(kind, data, seed, offset = 0, difficulty = 'standard') {
    const deck = shuffle(data.items, seed);
    const questions = deck.slice(offset, offset + roundCount);
    if (kind === 'yearrot') {
        const anchors = [0, 1].map(index => deck[(offset + questions.length + index) % deck.length]);
        return questions.map((event, index) => {
            const previous = questions.slice(0, index);
            if (difficulty === 'standard')
                return { event, timeline: [...anchors, ...previous].sort((a, b) => a[0] - b[0]) };
            const available = data.items.filter(row => !questions.some(q => q[0] === row[0])).sort((a, b) => a[0] - b[0]);
            let selected;
            if (difficulty === 'easy') {
                selected = [available[Math.floor((available.length - 1) * .25)], available[Math.ceil((available.length - 1) * .75)]];
            }
            else {
                const before = available.filter(row => row[0] < event[0]).at(-1);
                const after = available.find(row => row[0] > event[0]);
                selected = before && after ? [before, after] : [...available].sort((a, b) => Math.abs(a[0] - event[0]) - Math.abs(b[0] - event[0])).slice(0, 2);
            }
            return { event, timeline: [...selected, ...previous].sort((a, b) => a[0] - b[0]) };
        });
    }
    if (kind === 'borderrot') {
        return questions.map((route, index) => (index % 2 ? [...route].reverse() : route));
    }
    return questions;
}
export const newSession = (seed) => ({ seed, index: 0, answers: [], draft: [] });
export const phase = (state) => state.index === roundCount ? 'complete' :
    state.answers.length > state.index ? 'review' : 'guess';
function validPath(graph, question, path) {
    if (!Array.isArray(path) || path.length >= graph.size || !path.every((country) => typeof country === 'string') || !distinct([question[0], ...path]))
        return false;
    const countries = path;
    return countries.every((country, index) => graph.get(index ? countries[index - 1] : question[0])?.neighbours.includes(country) &&
        (country !== question.at(-1) || index === path.length - 1));
}
export function restoreSession(kind, data, questions, candidate, seed) {
    if (!candidate || candidate.seed !== seed || !Number.isInteger(candidate.index) || candidate.index < 0 ||
        candidate.index > roundCount || !Array.isArray(candidate.answers) || !Array.isArray(candidate.draft) ||
        candidate.answers.length < candidate.index ||
        candidate.answers.length > Math.min(candidate.index + 1, roundCount))
        return newSession(seed);
    const valid = candidate.answers.every((answer, index) => {
        const question = questions[index];
        if (kind === 'maprot')
            return isCoordinate(answer);
        if (kind === 'yearrot')
            return Number.isInteger(answer) && typeof answer === 'number' && answer >= 0 && typeof answer === 'number' && answer <= question.timeline.length;
        return answer === null || (validPath(data.graph, question, answer) && Array.isArray(answer) && answer.at(-1) === question.at(-1));
    });
    const draft = candidate.draft;
    const validDraft = draft.length === 0 || (phase(candidate) === 'guess' && (kind === 'maprot' ?
        isCoordinate(draft) : kind === 'borderrot' && validPath(data.graph, questions[candidate.index], draft) &&
        draft.at(-1) !== questions[candidate.index].at(-1)));
    return valid && validDraft ? candidate : newSession(seed);
}
export function transition(kind, data, questions, state, action) {
    const current = phase(state);
    if (current === 'review' && action.type === 'next')
        return { ...state, index: state.index + 1 };
    if (current !== 'guess')
        return state;
    const question = questions[state.index];
    const submit = (answer) => ({ ...state, answers: [...state.answers, answer], draft: [] });
    if (kind === 'maprot') {
        if (action.type === 'position' && isCoordinate(action.point))
            return { ...state, draft: action.point };
        if (action.type === 'submit' && isCoordinate(state.draft))
            return submit(state.draft);
    }
    else if (kind === 'yearrot') {
        if (action.type === 'place' && Number.isInteger(action.slot) && action.slot >= 0 &&
            action.slot <= question.timeline.length)
            return submit(action.slot);
    }
    else {
        if (action.type === 'skip')
            return submit(null);
        if (action.type === 'undo' && state.draft.length)
            return { ...state, draft: state.draft.slice(0, -1) };
        if (action.type === 'add') {
            const path = [...state.draft, action.country];
            if (validPath(data.graph, question, path)) {
                return action.country === question.at(-1) ? submit(path) : { ...state, draft: path };
            }
        }
    }
    return state;
}
export function scoreAnswer(kind, question, answer) {
    if (kind === 'maprot')
        return distanceKm(question.slice(2), answer);
    if (kind === 'yearrot') {
        const q = question;
        return Number(answer === q.timeline.filter(([year]) => year < q.event[0]).length);
    }
    return Number(answer !== null && Array.isArray(answer) && answer.length === question.length - 1);
}
export function rankingPuzzle(kind, questions) {
    if (kind === 'maprot') {
        // Retain the existing ranking identity for the same city and coordinates.
        return JSON.stringify(questions.map(([name, country, ...point]) => [name === 'Astana' && country === 'Kazakhstan' ? 'Nur-Sultan' : name, country, ...point]));
    }
    if (kind === 'borderrot')
        return JSON.stringify([2, questions]);
    return JSON.stringify(kind === 'yearrot' ? questions.map(({ event, timeline }) => [event[0], ...timeline.map(([year]) => year)]) : questions);
}
export function scoreSet(kind, questions, answers) {
    const scores = answers.map((answer, index) => scoreAnswer(kind, questions[index], answer));
    return { scores, total: scores.reduce((sum, score) => sum + score, 0) };
}
//# sourceMappingURL=rot-puzzles.js.map