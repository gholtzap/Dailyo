import { required } from '../dom.js';
import { dailyDate } from './bridge.js';
const games = [
    { id: 'train', label: 'trainrot', path: '/trainrot/' },
    { id: 'flags', label: 'flagrot', path: '/flags/' },
    { id: 'languages', label: 'langrot', path: '/languages/' },
    { id: 'vocabulary', label: 'Vocabulary', path: '/vocabulary/' },
    { id: 'maprot', label: 'maprot', path: '/maprot/' },
    { id: 'yearrot', label: 'yearrot', path: '/yearrot/' },
    { id: 'borderrot', label: 'borderrot', path: '/borderrot/' },
    { id: 'ladderrot', label: 'ladderrot', path: '/ladderrot/' },
    { id: 'cluerot', label: 'cluerot', path: '/cluerot/' },
    { id: 'scalerot', label: 'scalerot', path: '/scalerot/' },
    { id: 'swaprot', label: 'swaprot', path: '/swaprot/' },
    { id: 'skyrot', label: 'skyrot', path: '/skyrot/' },
    { id: 'pricerot', label: 'pricerot', path: '/pricerot/' },
    { id: 'skylinerot', label: 'skylinerot', path: '/skylinerot/' },
    { id: 'zoomrot', label: 'zoomrot', path: '/zoomrot/' },
    { id: 'orderrot', label: 'orderrot', path: '/orderrot/' },
];
const $ = required;
const gamePanel = $('#feed-game'), recap = $('#feed-recap'), progress = $('#feed-progress');
const actions = $('.feed-actions'), skip = $('#feed-skip'), retry = $('#feed-retry'), undo = $('#feed-undo');
const continueArea = $('#feed-continue'), next = $('#feed-next'), replay = $('#feed-replay');
const copyStatus = $('#feed-copy-status'), copyText = $('#feed-copy-text');
const recapDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
const recapColumn = Math.max(...games.map(({ label }) => label.length)) + 3;
let day = dailyDate(), skipped = readSkips(), results = new Map();
let index = -1, phase = 'loading', focusOnReady = false;
let frame = null, preload = null;
let timeout, lastSkip;
function skipKey() { return `dailyo:daily-feed:skipped:${day}`; }
function readSkips() {
    try {
        const ids = JSON.parse(localStorage.getItem(skipKey()) ?? 'null');
        return new Set(Array.isArray(ids) ? ids.filter(id => games.some(game => game.id === id)) : []);
    }
    catch {
        return new Set();
    }
}
function saveSkips() { try {
    localStorage.setItem(skipKey(), JSON.stringify([...skipped]));
}
catch { } }
function renderActions() {
    undo.parentElement.hidden = lastSkip === undefined;
    actions.hidden = lastSkip === undefined && !['playing', 'complete', 'error'].includes(phase);
    skip.hidden = !['playing', 'error'].includes(phase);
    retry.hidden = phase !== 'error';
    continueArea.hidden = phase !== 'complete';
    next.textContent = index === games.length - 1 ? 'See recap' : 'Next game';
}
function message(text, role = 'status') {
    const p = document.createElement('p');
    p.setAttribute('role', role);
    p.textContent = text;
    gamePanel.querySelector('p')?.remove();
    gamePanel.prepend(p);
}
function createFrame(game) {
    const child = document.createElement('iframe');
    child.src = `${game.path}?feed=1`;
    child.classList.add('feed-loading');
    return child;
}
function clearPreload() {
    preload?.frame.remove();
    preload = null;
}
function preloadNext() {
    const game = games[index + 1];
    if (!game || preload || document.hidden || navigator.connection?.saveData)
        return;
    const child = createFrame(game);
    child.dataset.feedPreload = '';
    preload = { position: index + 1, frame: child };
    gamePanel.append(child);
}
function showGame(position) {
    clearTimeout(timeout);
    frame?.remove();
    index = position;
    phase = 'loading';
    renderActions();
    const game = games[index];
    recap.hidden = Boolean(game);
    gamePanel.hidden = !game;
    if (!game) {
        phase = 'recap';
        frame = null;
        clearPreload();
        gamePanel.replaceChildren();
        progress.textContent = '';
        const rows = games.map(({ id, label }) => {
            const li = document.createElement('li');
            const name = document.createElement('span'), status = document.createElement('span');
            name.textContent = label;
            status.textContent = results.get(id) ?? 'Skipped';
            li.append(name, status);
            return li;
        });
        $('#feed-results').replaceChildren(...rows);
        copyStatus.textContent = '';
        copyText.hidden = true;
        replay.hidden = games.every(({ id }) => results.has(id));
        if (focusOnReady)
            recap.querySelector('h2').focus();
        focusOnReady = false;
        return;
    }
    progress.textContent = `${index + 1} of ${games.length}`;
    message(`Loading ${game.label}…`);
    if (preload?.position === position) {
        frame = preload.frame;
        preload = null;
        frame.title = game.label;
        delete frame.dataset.feedPreload;
        frame.contentWindow.postMessage('daily-game-activate', location.origin);
    }
    else {
        clearPreload();
        frame = createFrame(game);
        frame.title = game.label;
        gamePanel.append(frame);
    }
    timeout = setTimeout(showError, 12000);
}
function showError() {
    clearTimeout(timeout);
    if (phase === 'loading' && skipped.has(games[index].id)) {
        showGame(index + 1);
        return;
    }
    phase = 'error';
    frame?.remove();
    frame = null;
    message(`${games[index].label} didn’t load.`, 'alert');
    renderActions();
    if (focusOnReady)
        retry.focus();
    focusOnReady = false;
}
function changeDay() {
    const today = dailyDate();
    if (today === day)
        return false;
    day = today;
    lastSkip = undefined;
    skipped = readSkips();
    results = new Map();
    clearPreload();
    showGame(0);
    return true;
}
window.addEventListener('message', (event) => {
    if (event.origin !== location.origin)
        return;
    const { type, date, phase: reported, result } = event.data ?? {};
    if (type !== 'daily-game')
        return;
    if (preload && event.source === preload.frame.contentWindow) {
        // A failed or outdated child can report before it is activated. Try again on advance.
        clearPreload();
        return;
    }
    if (!frame || event.source !== frame.contentWindow || changeDay() || date !== day)
        return;
    if (reported === 'error') {
        showError();
        return;
    }
    if (!['playing', 'complete'].includes(reported))
        return;
    const game = games[index];
    if (reported === 'complete')
        results.set(game.id, typeof result === 'string' ? result : 'Played');
    else
        results.delete(game.id);
    if (phase === 'loading') {
        if (reported === 'complete' || skipped.has(game.id)) {
            showGame(index + 1);
            return;
        }
        clearTimeout(timeout);
        frame.classList.remove('feed-loading');
        gamePanel.querySelector('p')?.remove();
        if (focusOnReady)
            progress.focus();
        focusOnReady = false;
        preloadNext();
    }
    phase = reported;
    renderActions();
});
skip.onclick = () => {
    if (changeDay() || !['playing', 'error'].includes(phase))
        return;
    lastSkip = index;
    skipped.add(games[index].id);
    saveSkips();
    focusOnReady = false;
    showGame(index + 1);
    undo.focus();
};
undo.onclick = () => {
    if (changeDay() || lastSkip === undefined)
        return;
    const position = lastSkip;
    lastSkip = undefined;
    skipped.delete(games[position].id);
    saveSkips();
    focusOnReady = true;
    showGame(position);
};
retry.onclick = () => {
    if (changeDay() || phase !== 'error')
        return;
    focusOnReady = true;
    showGame(index);
};
next.onclick = () => {
    if (changeDay() || phase !== 'complete')
        return;
    focusOnReady = true;
    showGame(index + 1);
};
replay.onclick = () => {
    if (changeDay() || phase !== 'recap')
        return;
    lastSkip = undefined;
    skipped.clear();
    saveSkips();
    focusOnReady = true;
    showGame(0);
};
function recapText() {
    const rows = games.map(({ id, label }) => {
        const result = results.get(id) ?? 'Skipped';
        const solved = (id === 'ladderrot' || id === 'cluerot') && results.has(id) && result !== 'Answer shown';
        const outcome = solved ? 'Completed' : result.replace(/^(\d+) out of (\d+)$/, '$1/$2');
        return label.padEnd(recapColumn) + outcome;
    });
    return [
        `dailyo | ${recapDate.format(new Date(`${day}T00:00:00Z`))}`,
        `${results.size} of ${games.length} games completed`,
        '', ...rows, '', 'Play today’s Daily Games', 'https://trainrot.vercel.app/daily/',
    ].join('\n');
}
$('#feed-copy').onclick = async () => {
    if (changeDay() || phase !== 'recap')
        return;
    const text = recapText();
    let copied = false;
    try {
        await navigator.clipboard.writeText(text);
        copied = true;
    }
    catch { }
    if (changeDay() || phase !== 'recap' || recapText() !== text)
        return;
    copyStatus.textContent = copied ? 'Copied' : 'Select and copy the recap.';
    copyText.hidden = copied;
    if (!copied) {
        copyText.value = text;
        copyText.focus();
        copyText.select();
    }
};
let touchStart = null;
continueArea.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary)
        touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
continueArea.addEventListener('pointerup', event => {
    if (touchStart?.id !== event.pointerId)
        return;
    const up = touchStart.y - event.clientY, horizontal = Math.abs(touchStart.x - event.clientX);
    touchStart = null;
    if (up > 48 && up > horizontal * 1.5)
        next.click();
});
continueArea.addEventListener('pointercancel', () => { touchStart = null; });
window.addEventListener('pageshow', changeDay);
document.addEventListener('visibilitychange', () => { if (!document.hidden)
    changeDay(); });
setInterval(changeDay, 30000);
showGame(0);
//# sourceMappingURL=feed.js.map