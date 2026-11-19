// Ride edges are whole, directed train trips. Each leg must fit one published
// daytime pattern: an express cannot silently stop at a local station.
import { trainTransition } from './verified/train-state.js';
export { MAX_GUESSES } from './verified/train-state.js';
export function createRouter(data) {
    const outgoing = new Map();
    data.patterns.forEach((p, patternIndex) => {
        p.stations.forEach((station, index) => {
            if (!outgoing.has(station))
                outgoing.set(station, []);
            outgoing.get(station).push({ p, patternIndex, index });
        });
    });
    const walking = new Map();
    for (const walk of data.walkingConnections ?? []) {
        if (!data.stations[walk.from] || !data.stations[walk.to])
            continue;
        for (const [from, to] of [[walk.from, walk.to], [walk.to, walk.from]]) {
            if (!walking.has(from))
                walking.set(from, []);
            walking.get(from).push({ ...walk, from, to });
        }
    }
    const bestCache = new Map();
    const rideCache = new Map();
    function rides(from, route) {
        const cacheKey = from + ":" + (route ?? "*");
        if (rideCache.has(cacheKey))
            return rideCache.get(cacheKey);
        const options = new Map();
        for (const before of [null, ...(walking.get(from) ?? [])]) {
            const boarding = before?.to ?? from;
            for (const { p, patternIndex, index } of outgoing.get(boarding) ?? []) {
                if (route && p.route !== route)
                    continue;
                let seconds = 0;
                for (let end = index + 1; end < p.stations.length; end++) {
                    seconds += p.seconds[end - 1];
                    const arrival = p.stations[end];
                    for (const after of [null, ...(walking.get(arrival) ?? [])]) {
                        const to = after?.to ?? arrival;
                        if (to === from)
                            continue;
                        const duration = seconds + (before?.seconds ?? 0) + (after?.seconds ?? 0);
                        const key = `${p.route}:${to}`;
                        if (!options.has(key) || options.get(key).seconds > duration) {
                            options.set(key, { from, to, route: p.route, seconds: duration, stops: end - index, patternIndex, start: index, end, ...(before ? { walkBefore: before } : {}), ...(after ? { walkAfter: after } : {}) });
                        }
                    }
                }
            }
        }
        const result = [...options.values()];
        rideCache.set(cacheKey, result);
        return result;
    }
    // Ties follow the discovery order of the station, even after its cost improves.
    const compare = (a, b) => a.cost - b.cost || a.order - b.order;
    function enqueue(heap, item) {
        let i = heap.length;
        heap.push(item);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (compare(heap[parent], item) <= 0)
                break;
            heap[i] = heap[parent];
            i = parent;
        }
        heap[i] = item;
    }
    function dequeue(heap) {
        const first = heap[0], last = heap.pop();
        if (heap.length) {
            let i = 0;
            while (2 * i + 1 < heap.length) {
                let child = 2 * i + 1;
                if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) < 0)
                    child++;
                if (compare(heap[child], last) >= 0)
                    break;
                heap[i] = heap[child];
                i = child;
            }
            heap[i] = last;
        }
        return first;
    }
    function best(from, to) {
        const key = `${from}:${to}`;
        if (bestCache.has(key))
            return bestCache.get(key);
        if (!data.stations[from] || !data.stations[to] || from === to)
            return null;
        const start = { station: from, cost: 0, order: 0 };
        const costs = new Map([[from, start]]), previous = new Map();
        const queue = [start];
        while (true) {
            if (!queue.length) {
                bestCache.set(key, null);
                return null;
            }
            const entry = dequeue(queue);
            const { station: current, cost } = entry;
            if (entry !== costs.get(current))
                continue;
            if (current === to)
                break;
            for (const ride of rides(current)) {
                const next = cost + ride.seconds + (current === from ? 0 : data.metadata.transferSeconds);
                const known = costs.get(ride.to);
                if (next < (known?.cost ?? Infinity)) {
                    const update = { station: ride.to, cost: next, order: known?.order ?? costs.size };
                    costs.set(ride.to, update);
                    previous.set(ride.to, ride);
                    enqueue(queue, update);
                }
            }
        }
        const legs = [];
        let current = to;
        while (current !== from) {
            const leg = previous.get(current);
            legs.unshift(leg);
            current = leg.from;
        }
        const result = { seconds: costs.get(to).cost, legs };
        bestCache.set(key, result);
        return result;
    }
    function evaluate(from, to, draft) {
        if (draft.length && draft.every(entry => entry.to === undefined))
            return assessSequence(from, to, draft);
        const optimal = best(from, to);
        const legs = [];
        let current = from, seconds = 0;
        if (!optimal)
            return { valid: false, legs, error: 'No subway route connects these stations.', optimal };
        for (let index = 0; index < draft.length; index++) {
            const entry = draft[index];
            const ride = rides(current, entry.route).filter(r => r.to === entry.to).sort((a, b) => a.seconds - b.seconds)[0];
            if (!ride)
                return { valid: false, legs, brokenLeg: index, error: `Ride ${index + 1}: ${data.routes?.[entry.route]?.name ?? entry.route} does not run directly from ${data.stations[current].name} to ${data.stations[entry.to ?? '']?.name ?? 'that station'}.`, optimal };
            seconds += ride.seconds + (index ? data.metadata.transferSeconds : 0);
            legs.push(ride);
            current = ride.to;
        }
        if (current !== to)
            return { valid: false, legs, error: 'The route does not reach the destination.', optimal };
        return { valid: true, legs, seconds, score: seconds === optimal.seconds ? 100 : Math.min(99, Math.round(100 * optimal.seconds / seconds)), optimal };
    }
    function ridePoints(legs, ceiling, total) {
        let elapsed = 0, awarded = 0;
        return legs.map((ride, index) => { elapsed += ride.seconds + (index ? data.metadata.transferSeconds : 0); const cumulative = Math.round(ceiling * elapsed / total), points = cumulative - awarded; awarded = cumulative; return { route: ride.route, to: ride.to, points }; });
    }
    // Each layer consumes one chosen train. Keep the cheapest arrival at every
    // reachable transfer station, so a later train can change earlier transfers.
    function assessSequence(from, to, draft) {
        const optimal = best(from, to), empty = { valid: false, draft, legs: [], optimal, score: 0, ceiling: 0, points: [] };
        if (!draft.length || !optimal)
            return empty;
        let frontier = new Map([[from, { seconds: 0, legs: [] }]]), brokenLeg;
        for (const [index, entry] of draft.entries()) {
            const next = new Map();
            for (const [station, path] of frontier) {
                for (const ride of rides(station, entry.route)) {
                    const seconds = path.seconds + ride.seconds + (index ? data.metadata.transferSeconds : 0);
                    if (seconds < (next.get(ride.to)?.seconds ?? Infinity))
                        next.set(ride.to, { seconds, legs: [...path.legs, ride] });
                }
            }
            if (!next.size) {
                brokenLeg = index;
                break;
            }
            frontier = next;
        }
        const complete = brokenLeg === undefined ? frontier.get(to) : null;
        if (complete) {
            const score = complete.seconds === optimal.seconds ? 100 : Math.min(99, Math.round(100 * optimal.seconds / complete.seconds));
            return { valid: true, draft, ...complete, optimal, score, ceiling: score, points: ridePoints(complete.legs, score, complete.seconds) };
        }
        let completion;
        for (const [station, path] of frontier) {
            const remaining = station === to ? 0 : best(station, to)?.seconds;
            if (remaining === undefined)
                continue;
            const seconds = path.seconds + remaining + (station === to ? 0 : data.metadata.transferSeconds);
            if (!completion || seconds < completion.total)
                completion = { ...path, total: seconds };
        }
        if (!completion)
            return { ...empty, score: 1, ceiling: 1, brokenLeg, error: 'These trains do not connect.' };
        const ceiling = completion.total === optimal.seconds ? 100 : Math.min(99, Math.round(100 * optimal.seconds / completion.total));
        const points = ridePoints(completion.legs, ceiling, completion.total);
        const subtotal = points.reduce((sum, p) => sum + p.points, 0), score = Math.max(1, Math.min(99, subtotal));
        if (points.length)
            points.at(-1).points += score - subtotal;
        return { valid: false, draft, legs: completion.legs, optimal, score, ceiling, points, estimatedSeconds: completion.total, brokenLeg,
            error: brokenLeg === undefined ? 'Add another train to reach the destination.' : brokenLeg === 0 ? 'This train does not run from the start.' : 'These trains do not connect in this order.' };
    }
    function assess(from, to, draft) {
        if (draft.length && draft.every(entry => entry.to === undefined))
            return assessSequence(from, to, draft);
        const result = evaluate(from, to, draft);
        if (result.valid && result.seconds !== undefined && result.score !== undefined)
            return { ...result, draft, score: result.score, ceiling: result.score, points: ridePoints(result.legs, result.score, result.seconds) };
        if (!draft.length || !result.optimal)
            return { ...result, score: 0, ceiling: 0, points: [], draft };
        const prefix = result.legs, current = prefix.at(-1)?.to ?? from;
        const spent = prefix.reduce((sum, ride, index) => sum + ride.seconds + (index ? data.metadata.transferSeconds : 0), 0);
        const entry = draft[prefix.length];
        const estimates = (entry ? rides(current, entry.route) : []).flatMap(ride => {
            const remaining = ride.to === to ? 0 : best(ride.to, to)?.seconds;
            return remaining === undefined ? [] : [{ seconds: spent + (prefix.length ? data.metadata.transferSeconds : 0) + ride.seconds + remaining + (ride.to === to ? 0 : data.metadata.transferSeconds), ride }];
        });
        if (!estimates.length && prefix.length) {
            const remaining = best(current, to)?.seconds;
            if (remaining !== undefined)
                estimates.push({ seconds: spent + data.metadata.transferSeconds + remaining });
        }
        const estimate = estimates.sort((a, b) => a.seconds - b.seconds)[0], estimatedSeconds = estimate?.seconds ?? null;
        const ceiling = estimatedSeconds ? Math.max(1, Math.min(result.optimal.seconds === estimatedSeconds ? 100 : 99, Math.round(100 * result.optimal.seconds / estimatedSeconds))) : 1;
        const credited = [...prefix, ...(estimate?.ride ? [estimate.ride] : [])];
        const points = estimatedSeconds ? ridePoints(credited, ceiling, estimatedSeconds) : [];
        const subtotal = points.reduce((sum, p) => sum + p.points, 0), score = Math.max(1, Math.min(99, subtotal));
        if (points.length)
            points.at(-1).points += score - subtotal;
        const continuation = entry?.to === to && estimate?.ride && estimate.ride.to !== to ? { route: estimate.ride.route, to: estimate.ride.to } : null;
        return { ...result, draft, estimatedSeconds, score, ceiling, points, continuation };
    }
    function grade(from, to, guesses, fallback = []) {
        return assess(from, to, guesses?.at(-1) ?? fallback);
    }
    function feedback(from, to, draft) {
        const optimal = best(from, to);
        let current = from, seconds = 0, blocked = false;
        const legs = draft.map((entry, index) => {
            if (blocked)
                return { ...entry, status: 'blocked', label: 'Check earlier ride' };
            const options = rides(current, entry.route), ride = options.find(r => r.to === entry.to);
            const boarding = index ? data.metadata.transferSeconds : 0;
            // Check any equally fast continuation, rather than one chosen answer.
            const onFastest = (option) => {
                const remaining = option.to === to ? 0 : best(option.to, to)?.seconds;
                return remaining !== undefined && optimal && seconds + boarding + option.seconds + remaining + (option.to === to ? 0 : data.metadata.transferSeconds) === optimal.seconds;
            };
            if (!ride) {
                blocked = true;
                const rightTrain = options.some(onFastest);
                return { ...entry, status: rightTrain ? 'transfer' : options.length ? 'wrong-stop' : 'wrong-train', label: rightTrain ? 'Right train · transfer needed' : options.length ? 'Transfer needed' : 'Train doesn’t run here' };
            }
            const status = onFastest(ride) ? 'correct' : 'connected';
            seconds += ride.seconds + boarding;
            current = ride.to;
            return { ...entry, status, label: status === 'correct' ? 'On a fastest route' : 'Ride connects' };
        });
        return { legs };
    }
    return { best, evaluate, rides, feedback, assess, grade };
}
// Routing assessments are facts supplied to the shared, verified lifecycle.
export function transition(state, event, router) {
    return trainTransition(state, event, router);
}
export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
    return [minutes ? `${minutes} min` : '', remainder || !minutes ? `${remainder} sec` : ''].filter(Boolean).join(' ');
}
//# sourceMappingURL=router.js.map