import { dailyDate, rushDate } from './puzzles.js';
export { dailyDate };
const params = new URLSearchParams(location.search);
const round = params.get('rush');
const roundIndex = Number(round);
export const rushRound = window.parent !== window && /^\d+$/.test(round ?? '') && Number.isSafeInteger(roundIndex) ? roundIndex : null;
export const inFeed = window.parent !== window && (params.get('feed') === '1' || rushRound !== null);
const rushDay = rushRound === null ? null : rushDate(params.get('date'));
const rushRun = rushRound === null ? null : params.get('run') || crypto.randomUUID();
export const rushSeed = (kind) => `rush:${kind}:${rushDay}:${rushRun}`;
export const startPractice = !inFeed && params.get('practice') === '1';
if (inFeed)
    document.documentElement.dataset.dailyFeed = '';
if (rushRound !== null)
    document.documentElement.dataset.rush = '';
// Upcoming games can load data before they read or change the player's session.
export function waitForFeedActivation() {
    if (!inFeed || !window.frameElement?.hasAttribute('data-feed-preload'))
        return;
    return new Promise(resolve => {
        function activate(event) {
            if (event.source !== window.parent || event.origin !== location.origin || event.data !== 'daily-game-activate')
                return;
            window.removeEventListener('message', activate);
            resolve();
        }
        window.addEventListener('message', activate);
    });
}
export function reportDaily(phase, result, date = dailyDate()) {
    if (inFeed && rushRound === null)
        window.parent.postMessage({ type: 'daily-game', date, phase, result }, location.origin);
}
export function reportRush(phase, correct) {
    if (rushRound !== null)
        window.parent.postMessage({ type: 'rush-game', phase, correct }, location.origin);
}
export function onRushTimeout(reveal) {
    window.addEventListener('message', event => {
        if (event.origin === location.origin && event.source === window.parent && event.data === 'rush-timeout')
            reveal();
    });
}
//# sourceMappingURL=bridge.js.map