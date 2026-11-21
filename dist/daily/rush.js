import { RushMachine } from '../verified/rush-state.js';
import { required } from '../dom.js';
import { rushDate } from './puzzles.js';
const rotation = [
    { label: 'flagrot', path: '/flags/', seconds: [8, 6, 4] },
    { label: 'langrot', path: '/languages/', seconds: [8, 6, 4] },
    { label: 'trainrot', path: '/trainrot/', seconds: [35, 28, 21] },
    { label: 'Vocabulary', path: '/vocabulary/', seconds: [12, 9, 6] },
    { label: 'maprot', path: '/maprot/', seconds: [20, 15, 10] },
    { label: 'yearrot', path: '/yearrot/', seconds: [14, 10, 6] },
    { label: 'borderrot', path: '/borderrot/', seconds: [45, 35, 25] },
    { label: 'ladderrot', path: '/ladderrot/', seconds: [55, 45, 35] },
    { label: 'cluerot', path: '/cluerot/', seconds: [20, 15, 10] },
    { label: 'scalerot', path: '/scalerot/', seconds: [20, 15, 10] },
    { label: 'swaprot', path: '/swaprot/', seconds: [50, 40, 30] },
    { label: 'skyrot', path: '/skyrot/', seconds: [16, 12, 8] },
    { label: 'pricerot', path: '/pricerot/', seconds: [18, 14, 10] },
    { label: 'skylinerot', path: '/skylinerot/', seconds: [12, 9, 6] },
    { label: 'zoomrot', path: '/zoomrot/', seconds: [12, 9, 6] },
    { label: 'orderrot', path: '/orderrot/', seconds: [25, 20, 15] },
    { label: 'countrot', path: '/countrot/', seconds: [15, 12, 10] },
    { label: 'trackrot', path: '/trackrot/', seconds: [18, 14, 10] },
    { label: 'anglerot', path: '/anglerot/', seconds: [20, 15, 10] },
    { label: 'temporot', path: '/temporot/', seconds: [24, 22, 20] },
    { label: 'splitrot', path: '/splitrot/', seconds: [20, 15, 10] },
];
const slug = location.pathname.split('/')[2];
const selected = rotation.find(game => game.label.toLowerCase() === slug);
const games = selected ? [selected] : rotation;
const date = rushDate(new URLSearchParams(location.search).get('date'));
const bestKey = `dailyo:rush:best:${selected ? slug : 'all'}`;
if (selected)
    document.title = `${selected.label} Rush | dailyo`;
const $ = required;
const panel = $('#feed-game'), status = $('#rush-status'), clock = $('#rush-clock');
const timeDisplay = $('.rush-time');
const actions = $('.feed-actions'), retry = $('#rush-retry'), next = $('#rush-next');
const pause = $('#rush-pause');
const reviewButton = $('#rush-review'), recapReview = $('#rush-review-recap');
const scores = games.map(() => 0);
const copyStatus = $('#rush-copy-status'), copyText = $('#rush-copy-text');
const run = new RushMachine();
let runId = '';
let index = 0, round = 0, duration = 0;
const saveKey = `dailyo:rush:run:${selected ? slug : 'all'}`;
let recovery = null;
function roundDuration(gameIndex, roundIndex) {
    const game = games[gameIndex], timedRound = roundIndex + Number(gameIndex > 0);
    return game && timedRound ? game.seconds[Math.min(timedRound, game.seconds.length) - 1] * 1000 : 0;
}
function checkpoint(gameIndex = index, roundIndex = round, remaining = recovery?.remaining ?? run.remaining ?? (Number.isFinite(run.deadline) ? Math.max(0, run.deadline - performance.now()) : roundDuration(gameIndex, roundIndex))) {
    try {
        sessionStorage.setItem(saveKey, JSON.stringify({ date, games: games.map(g => g.label).join(','), runId, index: gameIndex, round: roundIndex, remaining, scores }));
    }
    catch { }
}
function readCheckpoint() {
    try {
        const s = JSON.parse(sessionStorage.getItem(saveKey) ?? 'null');
        if (s && s.date === date && s.games === games.map(g => g.label).join(',') && typeof s.runId === 'string' && /^[\da-f-]{36}$/i.test(s.runId) &&
            Number.isSafeInteger(s.index) && s.index >= 0 && s.index <= games.length && Number.isSafeInteger(s.round) && s.round >= 0 && s.round <= 1_000_000 &&
            Number.isFinite(s.remaining) && s.remaining >= 0 && s.remaining <= roundDuration(s.index, s.round) &&
            (s.remaining > 0 || roundDuration(s.index, s.round) === 0) && Array.isArray(s.scores) && s.scores.length === games.length && s.scores.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000))
            return s;
    }
    catch { }
    return null;
}
function helpOpen() { return !!visible?.contentDocument?.querySelector('#help-dialog[open]'); }
function updatePauseControl() {
    pause.hidden = helpOpen() || !['playing', 'paused'].includes(run.phase) || run.phase === 'playing' && !Number.isFinite(run.deadline);
    pause.textContent = run.phase === 'paused' ? 'Resume' : 'Pause';
}
let current, visible = null;
let timer, ticker;
const upcoming = new Map();
let review = { state: 'closed' };
let lastAnswer = null;
let advance = null;
function updateReviewControl() {
    reviewButton.hidden = !lastAnswer || review.state === 'previous' || review.state === 'held' && review.reason === 'explicit' || run.phase === 'loading' || run.phase === 'error';
    reviewButton.textContent = run.phase === 'feedback' ? 'Keep answer' : 'Review answer';
    recapReview.hidden = !lastAnswer;
}
function scheduleAdvance() {
    if (!advance || review.state !== 'closed' || run.phase !== 'feedback')
        return;
    advance.deadline = performance.now() + advance.remaining;
    const pending = advance;
    timer = setTimeout(() => { if (advance === pending && review.state === 'closed' && run.phase === 'feedback')
        openRound(pending.index, pending.round, pending.generation); }, pending.remaining);
}
function holdAnswer(reason) {
    if (run.phase !== 'feedback' || !advance || review.state === 'previous')
        return;
    if (review.state === 'closed')
        advance.remaining = Math.max(0, advance.deadline - performance.now());
    if (review.state === 'held' && review.reason === 'explicit' && reason === 'pointer')
        return;
    clearTimeout(timer);
    review = { state: 'held', reason };
    clock.textContent = 'Held';
    updateReviewControl();
}
function releaseAnswer() {
    if (review.state !== 'held' || review.reason !== 'pointer')
        return;
    review = { state: 'closed' };
    clock.textContent = '';
    if (advance)
        advance.remaining = Math.max(600, advance.remaining);
    updateReviewControl();
    scheduleAdvance();
}
function watchAnswer(doc) {
    doc.addEventListener('pointerdown', event => { if (event.button === 0)
        holdAnswer('pointer'); }, true);
    doc.addEventListener('pointerup', releaseAnswer, true);
    doc.addEventListener('pointercancel', () => holdAnswer('explicit'), true);
    doc.addEventListener('focusin', event => { if (event.target?.closest?.('details,dialog,a'))
        holdAnswer('explicit'); });
}
watchAnswer(document);
function openReview() {
    if (!lastAnswer || review.state !== 'closed')
        return;
    if (run.phase === 'feedback') {
        holdAnswer('explicit');
        return;
    }
    if (!['playing', 'paused', 'recap'].includes(run.phase))
        return;
    const from = run.phase;
    if (from === 'playing')
        pauseRound();
    // A deadline reached while opening Review belongs to the newly finished round.
    if (from === 'playing' && advance) {
        holdAnswer('explicit');
        return;
    }
    review = { state: 'previous', from, scroll: panel.parentElement.scrollTop };
    clearInterval(ticker);
    if (visible) {
        visible.hidden = true;
        visible.inert = true;
    }
    const frame = lastAnswer.frame;
    frame.hidden = false;
    frame.inert = false;
    frame.title = 'Previous answer';
    panel.hidden = false;
    actions.hidden = false;
    $('#feed-recap').hidden = true;
    panel.parentElement.scrollTop = 0;
    timeDisplay.hidden = true;
    status.textContent = `${lastAnswer.label} · ${lastAnswer.outcome}`;
    pause.hidden = true;
    next.removeAttribute('disabled');
    next.textContent = from === 'recap' ? 'Back to recap' : 'Back to puzzle';
    next.className = 'primary rush-continue';
    next.onclick = closeReview;
    updateReviewControl();
    next.focus();
}
function closeReview() {
    if (review.state !== 'previous' || !lastAnswer)
        return;
    const { from, scroll } = review;
    review = { state: 'closed' };
    timeDisplay.hidden = false;
    for (const dialog of lastAnswer.frame.contentDocument?.querySelectorAll('dialog[open]') ?? [])
        dialog.close();
    lastAnswer.frame.hidden = true;
    lastAnswer.frame.inert = true;
    lastAnswer.frame.removeAttribute('title');
    if (from === 'recap') {
        panel.hidden = true;
        actions.hidden = true;
        $('#feed-recap').hidden = false;
        recapReview.focus();
    }
    else {
        if (visible)
            visible.hidden = false;
        next.textContent = 'Skip game';
        next.className = 'secondary rush-skip';
        next.onclick = skipGame;
        if (from === 'playing' && run.phase === 'paused')
            resumeRound();
        else {
            status.textContent = `${games[index].label} · ${run.phase === 'paused' ? 'Paused' : `Round ${round + 1}`}`;
            next.toggleAttribute('disabled', run.phase === 'paused');
            updatePauseControl();
            if (visible)
                visible.inert = run.phase === 'paused';
            reviewButton.focus();
        }
    }
    panel.parentElement.scrollTop = scroll;
    updateReviewControl();
}
reviewButton.onclick = openReview;
recapReview.onclick = openReview;
function stopClock() {
    clearTimeout(timer);
    clearInterval(ticker);
    clock.textContent = '';
    timeDisplay.removeAttribute('data-timed');
}
function makeRound(gameIndex, roundIndex) {
    const frame = document.createElement('iframe');
    frame.src = `${games[gameIndex].path}?rush=${roundIndex}&date=${date}&run=${runId}`;
    frame.className = 'feed-loading';
    frame.inert = true;
    panel.append(frame);
    return { frame, ready: false };
}
function preload(gameIndex, roundIndex) {
    const key = `${gameIndex}:${roundIndex}`;
    if (games[gameIndex] && !upcoming.has(key))
        upcoming.set(key, makeRound(gameIndex, roundIndex));
}
function openRound(gameIndex, roundIndex = 0, generation = run.generation) {
    if (run.load(generation).$ === 'NoChange')
        return;
    review = { state: 'closed' };
    advance = null;
    updateReviewControl();
    updatePauseControl();
    stopClock();
    if (current?.frame !== visible)
        current?.frame.remove();
    index = gameIndex;
    round = roundIndex;
    checkpoint(index, round, recovery?.remaining ?? roundDuration(index, round));
    const game = games[index];
    if (!game) {
        showRecap();
        return;
    }
    retry.hidden = true;
    next.removeAttribute('disabled');
    next.textContent = 'Skip game';
    next.className = 'secondary rush-skip';
    next.onclick = skipGame;
    panel.hidden = false;
    if (visible)
        if (visible)
            visible.inert = true;
    const key = `${index}:${round}`;
    current = upcoming.get(key);
    upcoming.delete(key);
    for (const [other, slot] of upcoming) {
        if (other === `${index + 1}:0`)
            continue;
        slot.frame.remove();
        upcoming.delete(other);
    }
    current ??= makeRound(index, round);
    if (current.ready) {
        showRound();
        return;
    }
    status.textContent = `Loading ${game.label}…`;
    const loadingGeneration = run.generation;
    timer = setTimeout(() => showError(loadingGeneration), 12000);
}
function showError(generation = run.generation) {
    if (run.fail(generation).$ === 'NoChange')
        return;
    updatePauseControl();
    stopClock();
    current?.frame.remove();
    current = null;
    status.textContent = `${games[index].label} didn’t load.`;
    retry.hidden = false;
    retry.focus();
}
function showRound() {
    if (!current)
        return;
    const game = games[index];
    duration = roundDuration(index, round);
    const restoring = recovery;
    recovery = null;
    if (run.ready(performance.now(), duration ? (restoring?.remaining ?? duration) : undefined).$ === 'NoChange')
        return;
    updatePauseControl();
    stopClock();
    next.textContent = 'Skip game';
    next.className = 'secondary rush-skip';
    const { frame } = current;
    frame.title = game.label;
    frame.classList.remove('feed-loading');
    if (visible)
        frame.classList.add('rush-enter');
    if (visible === lastAnswer?.frame) {
        visible.hidden = true;
        visible.inert = true;
        visible.removeAttribute('title');
    }
    else
        visible?.remove();
    visible = frame;
    frame.inert = false;
    if (frame.contentDocument)
        watchAnswer(frame.contentDocument);
    updateReviewControl();
    status.textContent = `${game.label} · Round ${round + 1}`;
    if (duration) {
        timeDisplay.dataset.timed = '';
        updateClock();
        ticker = setInterval(updateClock, 100);
    }
    else {
        clock.textContent = 'Untimed';
    }
    pause.hidden = !Number.isFinite(run.deadline);
    if (document.hidden || restoring && duration)
        pauseRound();
    if (run.phase === 'paused')
        pause.focus();
    else
        frame.contentDocument?.querySelector('#question-title, #rush-journey, #round-title, #extra-title')?.focus({ preventScroll: true });
    checkpoint();
    if (!document.hidden && !navigator.connection?.saveData) {
        preload(index, round + 1);
        preload(index + 1, 0);
    }
}
function updateClock() {
    const remaining = run.deadline - performance.now();
    if (remaining <= 0) {
        finishRound(false, true);
        return;
    }
    clock.textContent = `${Math.ceil(remaining / 1000)}s`;
    timeDisplay.style.setProperty('--rush-remaining', String(Math.min(1, remaining / duration)));
}
function finishRound(correct, expired = false) {
    showFinish(expired ? run.timeout(performance.now()) : run.answer(correct, performance.now()));
}
function showFinish(effect) {
    if (effect.$ !== 'Finished')
        return;
    updatePauseControl();
    const { correct, expired } = effect;
    stopClock();
    if (correct)
        scores[index]++;
    if (lastAnswer && lastAnswer.frame !== visible)
        lastAnswer.frame.remove();
    lastAnswer = visible ? { frame: visible, label: `${games[index].label} · Round ${round + 1}`, outcome: expired ? 'Time’s up' : correct ? 'Correct' : 'Missed' } : null;
    if (visible)
        visible.dataset.rushAnswer = '';
    const nextIndex = correct ? index : index + 1, nextRound = correct ? round + 1 : 0;
    checkpoint(nextIndex, nextRound, roundDuration(nextIndex, nextRound));
    status.textContent = expired ? 'Time’s up' : correct ? 'Correct' : 'Missed';
    if (expired)
        visible?.contentWindow?.postMessage('rush-timeout', location.origin);
    next.textContent = correct ? 'Next' : index === games.length - 1 ? 'See recap' : 'Next game';
    next.className = 'primary rush-continue';
    status.focus({ preventScroll: true });
    // Brief feedback, then continue automatically to the next puzzle or game.
    advance = { generation: run.generation, index: nextIndex, round: nextRound, remaining: correct ? 180 : 2400, deadline: 0 };
    scheduleAdvance();
    updateReviewControl();
    next.onclick = () => { if (run.phase === 'feedback' && advance)
        openRound(advance.index, advance.round, advance.generation);
    else
        skipGame(); };
}
function showRecap() {
    if (run.complete().$ === 'NoChange')
        return;
    updatePauseControl();
    current = null;
    visible = null;
    upcoming.clear();
    for (const child of [...panel.children])
        if (child !== lastAnswer?.frame)
            child.remove();
    if (lastAnswer) {
        lastAnswer.frame.hidden = true;
        lastAnswer.frame.inert = true;
        lastAnswer.frame.removeAttribute('title');
    }
    updateReviewControl();
    panel.hidden = true;
    actions.hidden = true;
    $('#feed-recap').hidden = false;
    copyStatus.textContent = '';
    copyText.hidden = true;
    const { total: sum, bestRun } = scoreSummary();
    showPersonalBest(sum);
    $('#rush-score').textContent = `${sum} correct${bestRun ? ` · Best run: ${bestRun}` : ''}`;
    $('#feed-results').replaceChildren(...games.map((game, i) => {
        const row = document.createElement('li');
        const score = document.createElement('span');
        score.textContent = `${game.label} · ${scores[i]} correct`;
        const link = document.createElement('a');
        link.href = `${game.path}?practice=1`;
        link.textContent = 'Play more';
        link.setAttribute('aria-label', `Play more ${game.label}`);
        row.append(score, link);
        return row;
    }));
    $('#feed-recap h2').focus();
    checkpoint(games.length, 0, 0);
}
window.addEventListener('message', (event) => {
    if (event.origin !== location.origin)
        return;
    if (event.data?.type === 'rush-help') {
        if (event.source !== visible?.contentWindow || typeof event.data.open !== 'boolean')
            return;
        if (event.data.open) {
            holdAnswer('explicit');
            pauseRound();
        }
        updatePauseControl();
        if (run.phase === 'paused') {
            visible.inert = !helpOpen();
            if (!helpOpen())
                pause.focus();
        }
        return;
    }
    const { type, phase: reported, correct } = event.data ?? {};
    if (type !== 'rush-game')
        return;
    if (event.source !== current?.frame.contentWindow) {
        for (const [key, slot] of upcoming) {
            if (event.source !== slot.frame.contentWindow)
                continue;
            if (reported === 'ready')
                slot.ready = true;
            if (reported === 'error') {
                slot.frame.remove();
                upcoming.delete(key);
            }
            break;
        }
        return;
    }
    if (run.phase === 'loading' && reported === 'ready')
        showRound();
    if (run.phase === 'loading' && reported === 'error')
        showError();
    if (run.phase === 'playing' && reported === 'answered' && typeof correct === 'boolean') {
        showFinish(run.answer(correct, performance.now()));
    }
});
function scoreSummary() {
    const total = scores.reduce((sum, score) => sum + score, 0);
    const best = Math.max(...scores);
    const labels = games.filter((_, i) => scores[i] === best).map(game => game.label);
    return { total, bestRun: best ? `${best} in ${labels.join(', ')}` : '' };
}
function showPersonalBest(total) {
    const label = $('#rush-personal-best');
    label.textContent = '';
    try {
        const saved = Number(localStorage.getItem(bestKey));
        const previous = Number.isSafeInteger(saved) && saved > 0 ? saved : 0;
        if (total > previous)
            localStorage.setItem(bestKey, String(total));
        if (total || previous)
            label.textContent = `${total > previous ? 'New best' : 'Personal best'} · ${Math.max(total, previous)} correct`;
    }
    catch { }
}
function shareText() {
    const title = selected ? `dailyo Rush · ${selected.label}` : 'dailyo Rush';
    const { total, bestRun } = scoreSummary();
    const score = `${total} correct${!selected && bestRun ? ` · ${bestRun}` : ''}`;
    const rows = selected ? [] : ['', ...games.map(({ label }, i) => `${label} · ${scores[i]} correct`)];
    const path = selected ? `/rush/${slug}/` : '/rush/';
    return [`${title} · ${date}`, score, ...rows, '', `https://trainrot.vercel.app${path}?date=${date}`].join('\n');
}
$('#rush-copy').onclick = async () => {
    if (run.phase !== 'recap')
        return;
    const text = shareText();
    let copied = false;
    try {
        await navigator.clipboard.writeText(text);
        copied = true;
    }
    catch { }
    if (run.phase !== 'recap' || shareText() !== text)
        return;
    copyStatus.textContent = copied ? 'Copied' : 'Select and copy your results.';
    copyText.hidden = copied;
    if (!copied) {
        copyText.value = text;
        copyText.focus();
        copyText.select();
    }
};
function start() {
    lastAnswer?.frame.remove();
    lastAnswer = null;
    review = { state: 'closed' };
    advance = null;
    updateReviewControl();
    recovery = null;
    runId = crypto.randomUUID();
    scores.fill(0);
    $('#feed-recap').hidden = true;
    actions.hidden = false;
    openRound(0);
    status.focus({ preventScroll: true });
}
$('#rush-replay').onclick = () => { if (run.phase === 'recap')
    start(); };
retry.onclick = () => { if (run.phase === 'error')
    openRound(index, round); };
function skipGame() { if (['loading', 'playing', 'error'].includes(run.phase)) {
    recovery = null;
    openRound(index + 1);
} }
next.onclick = skipGame;
function pauseRound() {
    const effect = run.pause(performance.now());
    if (effect.$ === 'Finished') {
        showFinish(effect);
        return;
    }
    if (effect.$ !== 'Suspended')
        return;
    updatePauseControl();
    clearInterval(ticker);
    if (visible) {
        visible.inert = !helpOpen();
        visible.contentDocument.documentElement.dataset.rushPaused = '';
    }
    visible?.contentWindow?.postMessage('rush-pause', location.origin);
    status.textContent = `${games[index].label} · Paused`;
    next.setAttribute('disabled', '');
    checkpoint();
}
function resumeRound() {
    if (helpOpen())
        return;
    if (run.resume(performance.now(), !document.hidden).$ !== 'Resumed')
        return;
    updatePauseControl();
    if (visible) {
        visible.inert = false;
        delete visible.contentDocument.documentElement.dataset.rushPaused;
    }
    visible?.contentWindow?.postMessage('rush-resume', location.origin);
    status.textContent = `${games[index].label} · Round ${round + 1}`;
    next.removeAttribute('disabled');
    updateClock();
    ticker = setInterval(updateClock, 100);
    visible?.contentDocument?.querySelector('#question-title, #rush-journey, #round-title, #extra-title')?.focus({ preventScroll: true });
    checkpoint();
}
pause.onclick = () => { if (run.phase === 'paused')
    resumeRound();
else
    pauseRound(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) {
    holdAnswer('explicit');
    pauseRound();
} });
// Playing + help/background/leave -> Paused; Paused + explicit Resume -> Playing.
// Reload + valid checkpoint -> Loading -> Paused (or untimed Playing); feedback checkpoints the next round once.
window.addEventListener('pagehide', () => {
    if (run.phase === 'playing')
        pauseRound();
    if (run.phase !== 'feedback' && run.phase !== 'loading')
        checkpoint();
});
recovery = readCheckpoint();
if (recovery) {
    runId = recovery.runId;
    scores.splice(0, scores.length, ...recovery.scores);
    $('#feed-recap').hidden = true;
    actions.hidden = false;
    openRound(recovery.index, recovery.round);
}
else
    start();
//# sourceMappingURL=rush.js.map