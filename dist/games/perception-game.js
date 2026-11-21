import { dailyDate, inFeed, startPractice, waitForFeedActivation, reportDaily, rushRound, rushSeed, reportRush, onRushTimeout, readRushDraft, saveRushDraft } from '../daily/bridge.js';
import { showGameProgress } from './help.js';
import { perceptionGames, perceptionPuzzle, perceptionGrade, reflect } from './perception-puzzles.js';
const name = document.body.dataset.game;
if (!perceptionGames.includes(name))
    throw new Error('Unknown perception game');
const game = name, quiz = document.querySelector('#quiz');
const isRush = rushRound !== null;
// State | Event | Rule | Next: ready/start -> showing; showing/shown -> answering;
// showing or answering/answer -> feedback; feedback/next -> ready or results.
// Any/reset -> ready or results; all other events are ignored. Reset releases timers/audio.
const transitions = { ready: { start: 'showing', reset: 'ready' }, showing: { shown: 'answering', answer: 'feedback', reset: 'ready' }, answering: { answer: 'feedback', reset: 'ready' }, feedback: { next: 'ready', reset: 'ready' }, results: { reset: 'ready' } };
let day = dailyDate(), mode = startPractice ? 'practice' : 'daily', hard = false, phase = 'ready';
let session = { seed: day, answers: [] }, q;
let timer, animation = 0, audio;
let timerCallback, timerDeadline = 0, animateRound, pausedFor = 0;
// Host pause is independent of the puzzle phase; it freezes playback and answer deadlines.
let playback = { state: 'running' };
let draft = 50, taps = [], beatStart = 0, feedback;
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined)
    n.textContent = text; if (className)
    n.className = className; return n; };
const button = (text, action, kind = 'secondary') => { const b = el('button', text, kind); b.type = 'button'; b.onclick = action; return b; };
const key = () => `dailyo:${game}:v1:${mode === 'daily' ? day : `practice:${hard ? 'hard' : 'standard'}`}`;
function stop() { clearTimeout(timer); timerCallback = undefined; animateRound = undefined; cancelAnimationFrame(animation); if (audio) {
    void audio.close().catch(() => { });
    audio = undefined;
} }
function later(callback, delay) { clearTimeout(timer); timerCallback = callback; timerDeadline = performance.now() + delay; timer = setTimeout(() => { timerCallback = undefined; callback(); }, delay); }
function pausePlayback() { if (playback.state === 'paused')
    return; playback = { state: 'paused', since: performance.now(), remaining: Math.max(0, timerDeadline - performance.now()) }; clearTimeout(timer); cancelAnimationFrame(animation); if (audio)
    void audio.suspend().catch(() => { }); }
function resumePlayback() { if (playback.state !== 'paused')
    return; const elapsed = performance.now() - playback.since, remaining = playback.remaining; playback = { state: 'running' }; pausedFor += elapsed; beatStart += elapsed; if (audio)
    void audio.resume().catch(() => { }); if (timerCallback)
    later(timerCallback, remaining); if (animateRound)
    animation = requestAnimationFrame(animateRound); }
function transition(event) {
    const next = transitions[phase][event];
    if (!next)
        return false;
    phase = (event === 'next' || event === 'reset') && session.answers.length >= count() ? 'results' : next;
    if (phase === 'ready' && !isRush && mode === 'practice' && (game === 'anglerot' || game === 'splitrot')) {
        draft = game === 'anglerot' ? 0 : 50;
        transition('start');
        transition('shown');
    }
    return true;
}
function save() { if (isRush)
    return; try {
    localStorage.setItem(key(), JSON.stringify(session));
}
catch { } }
function load() {
    session = { seed: mode === 'daily' ? day : `practice:${crypto.randomUUID()}`, answers: [] };
    if (isRush) {
        session.seed = rushSeed(game);
        return;
    }
    try {
        const saved = JSON.parse(localStorage.getItem(key()) ?? 'null');
        if (saved && typeof saved.seed === 'string' && saved.seed.length < 100 && (mode === 'daily' ? saved.seed === day : saved.seed.startsWith('practice:')) && Array.isArray(saved.answers) && saved.answers.length <= 5 && saved.answers.every(a => a && Number.isInteger(a.points) && a.points >= 0 && a.points <= 100 && typeof a.detail === 'string' && a.detail.length < 300 && (a.guess === null || typeof a.guess === 'number' && Number.isFinite(a.guess) || Array.isArray(a.guess) && a.guess.length === 8 && a.guess.every(Number.isFinite))))
            session = saved;
    }
    catch { }
}
const count = () => isRush ? 1 : 5;
function reset() { stop(); feedback = undefined; taps = []; load(); save(); transition('reset'); draw(); }
function checkDate() { if (!isRush && day !== dailyDate()) {
    day = dailyDate();
    reset();
    return true;
} return false; }
function switchMode(next) { mode = next; reset(); }
const instructions = { countrot: 'Estimate how many dots you see before they disappear.', trackrot: 'Watch the ball, then mark where it will land.', anglerot: 'Turn the line counterclockwise to the requested angle.', temporot: 'Listen to four beats, then keep the rhythm for eight taps.', splitrot: 'Mark the requested part of the line.' };
function finish(guess) {
    if (checkDate() || !transition('answer'))
        return;
    stop();
    const grade = guess === null ? { points: 0, error: Infinity } : perceptionGrade(game, q, guess);
    const format = (n, digits = 1) => Number(n.toFixed(digits));
    const detail = guess === null ? 'Round skipped' : game === 'countrot' ? `${q.target} dots · Your estimate: ${guess}` : game === 'trackrot' ? `${format(grade.error * 100)}% of the field off` : game === 'anglerot' ? `${format(grade.error)}° off · Target: ${q.target}°` : game === 'temporot' ? `${Math.round(grade.error)} ms average timing error` : `${format(grade.error * 100)} percentage points off`;
    feedback = { ...grade, detail, guess };
    session.answers.push(feedback);
    save();
    draw();
    quiz.querySelector('#perception-feedback')?.focus();
    if (isRush)
        reportRush('answered', grade.points >= 70);
}
function canvas() { const c = el('canvas', undefined, 'perception-field'); c.width = 960; c.height = 560; c.setAttribute('role', 'img'); c.setAttribute('aria-label', game === 'countrot' ? 'Dot field' : game === 'trackrot' ? 'Ball flight and landing field' : 'Angle dial'); return c; }
function line(ctx, x1, y1, x2, y2, color, width = 4) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function ball(ctx, x, y, r = 10, color = '#eeeef0') { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); }
function track(c, t, reveal = false) {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 960, 560);
    line(ctx, 40, 500, 920, 500, '#7d8088');
    const position = (progress) => ({ x: 40 + reflect(q.start + q.velocity * progress) * 880, y: 80 + 420 * progress - 200 * Math.sin(Math.PI * progress) });
    if (reveal) {
        ctx.setLineDash([8, 8]);
        for (let p = 0; p < 1; p += .01) {
            const a = position(p), b = position(Math.min(1, p + .01));
            line(ctx, a.x, a.y, b.x, b.y, '#7d8088', 2);
        }
        ctx.setLineDash([]);
        ball(ctx, 40 + q.target * 880, 500, 12, '#92d6aa');
    }
    if (t < .55) {
        const p = position(t);
        ball(ctx, p.x, p.y);
    }
    if (phase !== 'showing') {
        line(ctx, 40 + draft * 8.8, 478, 40 + draft * 8.8, 524, '#f3ce78', 5);
    }
}
function angle(c, reveal = false) { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 960, 560); ctx.strokeStyle = '#62666d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(480, 280, 200, 0, Math.PI * 2); ctx.stroke(); line(ctx, 480, 280, 680, 280, '#7d8088', 3); const ray = (a, color) => line(ctx, 480, 280, 480 + 200 * Math.cos(a * Math.PI / 180), 280 - 200 * Math.sin(a * Math.PI / 180), color, 5); if (reveal)
    ray(q.target, '#92d6aa'); ray(draft, '#f3ce78'); ball(ctx, 480, 280, 7); }
function slider(label, min, max, value, change) { const wrap = el('div', undefined, 'perception-control'); const id = 'perception-input'; const l = el('label', label); l.htmlFor = id; const input = el('input'); input.id = id; input.type = 'range'; input.min = String(min); input.max = String(max); input.step = '0.1'; input.value = String(value); input.oninput = () => change(Number(input.value)); wrap.append(l, input); return wrap; }
function start() {
    if (checkDate() || !transition('start'))
        return;
    pausedFor = 0;
    draft = game === 'countrot' ? 20 : game === 'anglerot' ? 0 : 50;
    taps = [];
    draw();
    if (game === 'countrot' || game === 'trackrot') {
        const c = quiz.querySelector('canvas'), ctx = c.getContext('2d'), begin = performance.now();
        const moving = q.hard && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration = game === 'countrot' ? 1100 : 1300;
        const animate = () => {
            const elapsed = performance.now() - begin - pausedFor;
            ctx.clearRect(0, 0, 960, 560);
            if (game === 'countrot')
                for (const dot of q.dots)
                    ball(ctx, 40 + reflect(dot.x + (moving ? dot.dx * elapsed / 1000 : 0)) * 880, 40 + reflect(dot.y + (moving ? dot.dy * elapsed / 1000 : 0)) * 480, 8);
            else
                track(c, elapsed / 2400);
            if (elapsed < duration)
                animation = requestAnimationFrame(animate);
        };
        animateRound = animate;
        animate();
        later(() => { if (transition('shown')) {
            cancelAnimationFrame(animation);
            animateRound = undefined;
            draw();
            quiz.querySelector('input')?.focus();
        } }, duration);
    }
    else if (game === 'temporot')
        void startAudio();
    else {
        transition('shown');
        draw();
        quiz.querySelector('input')?.focus();
    }
}
async function startAudio() {
    let attempt;
    try {
        audio = new AudioContext();
        const currentAudio = audio;
        attempt = currentAudio;
        await audio.resume();
        if (phase !== 'showing' || audio !== currentAudio)
            return;
        const when = audio.currentTime + .15;
        beatStart = performance.now() + 150;
        quiz.querySelector('.tempo-status').textContent = 'Listen to the four reference beats…';
        for (let i = 0; i < 4; i++) {
            const tone = (offset, volume) => { const osc = currentAudio.createOscillator(), gain = currentAudio.createGain(), at = when + offset / 1000; osc.frequency.value = 660; gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + .07); osc.connect(gain); gain.connect(currentAudio.destination); osc.start(at); osc.stop(at + .08); };
            tone(i * q.interval, .3);
            if (q.hard && i < 3)
                tone((i + .5) * q.interval, .08);
        }
        later(() => { if (!transition('shown'))
            return; draw(); quiz.querySelector('#tap')?.focus(); later(() => finish(taps.length === 8 ? taps : null), q.interval * 10); }, 150 + 3 * q.interval + 100);
    }
    catch {
        if (attempt && audio !== attempt)
            return;
        stop();
        transition('reset');
        draw();
        quiz.prepend(el('p', 'Sound could not start. Check your audio settings and try again.', 'feedback'));
    }
}
function tap() { if (phase !== 'answering' || game !== 'temporot')
    return; taps.push(performance.now() - beatStart); const status = quiz.querySelector('#tap-progress'); if (status)
    status.textContent = `${taps.length} of 8 taps`; if (taps.length === 8)
    finish(taps); }
function drawRound() {
    const i = session.answers.length - (phase === 'feedback' ? 1 : 0);
    q = perceptionPuzzle(game, session.seed, isRush ? rushRound : i, mode === 'practice' && hard);
    showGameProgress(isRush ? undefined : el('p', `${i + 1} of ${count()}`, 'rot-counter'));
    const titles = { countrot: 'How many dots?', trackrot: 'Where will it land?', anglerot: 'Set the angle', temporot: 'Keep the beat', splitrot: 'Split the line' };
    const title = el('h2', titles[game]);
    title.id = 'question-title';
    title.tabIndex = -1;
    quiz.append(title);
    if (phase === 'ready') {
        quiz.append(el('p', instructions[game], 'perception-note'));
        if (q.hard)
            quiz.append(el('p', game === 'countrot' ? 'The dots move.' : game === 'trackrot' ? 'The ball bounces off the side walls.' : game === 'anglerot' ? 'Include every full turn.' : game === 'temporot' ? 'Tap halfway between the beats.' : 'The fraction extends beyond the line.', 'perception-note'));
        if (game === 'temporot')
            quiz.append(el('p', 'Turn on sound. Use Tap or the Space key.', 'perception-note'));
        quiz.append(button('Start round', start, 'primary'));
        return;
    }
    const reveal = phase === 'feedback';
    if (game === 'countrot') {
        if (phase === 'showing' || reveal) {
            const c = canvas();
            quiz.append(c);
            if (reveal)
                for (const dot of q.dots)
                    ball(c.getContext('2d'), 40 + dot.x * 880, 40 + dot.y * 480, 8);
        }
        if (phase === 'answering') {
            const form = el('form', undefined, 'perception-control'), label = el('label', 'How many dots?'), input = el('input');
            input.type = 'number';
            input.id = 'dot-count';
            input.min = '1';
            input.max = '100';
            input.required = true;
            input.inputMode = 'numeric';
            label.htmlFor = input.id;
            const submit = el('button', 'Check estimate', 'primary');
            submit.type = 'submit';
            form.onsubmit = e => { e.preventDefault(); finish(Number(input.value)); };
            form.append(label, input, submit);
            quiz.append(form);
        }
    }
    else if (game === 'trackrot') {
        const c = canvas();
        quiz.append(c);
        track(c, 1, reveal);
        if (phase === 'answering') {
            const pick = (value) => { draft = value; track(c, 1); };
            quiz.append(slider('Landing position', 0, 100, draft, pick));
            c.style.touchAction = 'none';
            c.onpointerdown = e => { c.setPointerCapture(e.pointerId); pick(Math.max(0, Math.min(100, ((e.clientX - c.getBoundingClientRect().left) / c.clientWidth * 960 - 40) / 8.8))); };
            c.onpointermove = e => { if (c.hasPointerCapture(e.pointerId))
                pick(Math.max(0, Math.min(100, ((e.clientX - c.getBoundingClientRect().left) / c.clientWidth * 960 - 40) / 8.8))); };
            quiz.append(button('Check landing', () => finish(draft / 100), 'primary'));
        }
    }
    else if (game === 'anglerot') {
        quiz.append(el('p', `Target: ${q.target}° counterclockwise`, 'perception-target'));
        const c = canvas();
        quiz.append(c);
        angle(c, reveal);
        if (phase === 'answering') {
            const turns = el('p', q.hard ? 'Full turns: 0' : '', 'perception-note');
            quiz.append(slider('Rotate line', 0, q.hard ? 1080 : 360, draft, value => { draft = value; angle(c); if (q.hard)
                turns.textContent = `Full turns: ${Math.floor(value / 360)}`; }));
            if (q.hard)
                quiz.append(turns);
            quiz.append(button('Check angle', () => finish(draft), 'primary'));
        }
    }
    else if (game === 'splitrot') {
        quiz.append(el('p', `Mark ${Math.round(q.target * 100)}% from the ${q.right ? 'right' : 'left'} endpoint.`, 'perception-target'));
        const field = el('div', undefined, 'split-field');
        field.setAttribute('role', 'group');
        field.setAttribute('aria-label', 'Reference line with selection');
        const base = el('div', undefined, 'split-line'), left = el('span', 'Left', 'split-left'), right = el('span', 'Right', 'split-right'), marker = el('span', undefined, 'split-marker');
        const coordinate = (value) => q.hard ? (100 + value) / 3 : value;
        const position = (guess) => { marker.style.left = `${coordinate(guess)}%`; };
        field.append(base, left, right, marker);
        field.dataset.extended = String(q.hard);
        position(draft);
        quiz.append(field);
        if (reveal) {
            const answer = el('span', undefined, 'split-marker split-answer');
            answer.style.left = `${coordinate((q.right ? 1 - q.target : q.target) * 100)}%`;
            field.append(answer);
        }
        if (phase === 'answering') {
            quiz.append(slider('Split position', q.hard ? -100 : 0, q.hard ? 200 : 100, draft, value => { draft = value; position(value); }));
            field.style.touchAction = 'none';
            const pick = (e) => { const fraction = (e.clientX - field.getBoundingClientRect().left) / field.clientWidth; draft = q.hard ? Math.max(-100, Math.min(200, (fraction * 3 - 1) * 100)) : Math.max(0, Math.min(100, fraction * 100)); position(draft); quiz.querySelector('input').value = String(draft); };
            field.onpointerdown = e => { field.setPointerCapture(e.pointerId); pick(e); };
            field.onpointermove = e => { if (field.hasPointerCapture(e.pointerId))
                pick(e); };
            quiz.append(button('Check split', () => finish(q.right ? 1 - draft / 100 : draft / 100), 'primary'));
        }
    }
    else {
        if (phase === 'showing')
            quiz.append(el('p', 'Starting sound…', 'tempo-status'));
        if (phase === 'answering') {
            const progress = el('p', '0 of 8 taps', 'tempo-status');
            progress.id = 'tap-progress';
            const b = button('Tap', tap, 'primary tempo-tap');
            b.id = 'tap';
            quiz.append(progress, b);
        }
    }
    if (reveal && feedback) {
        const box = el('div', undefined, 'perception-feedback');
        box.setAttribute('role', 'status');
        const h = el('h3', `${feedback.points} / 100 points`);
        h.id = 'perception-feedback';
        h.tabIndex = -1;
        box.append(h, el('p', feedback.detail));
        quiz.append(box);
        if (!isRush)
            quiz.append(button(session.answers.length === count() ? 'See results' : 'Next', () => { if (!transition('next'))
                return; feedback = undefined; draw(); quiz.querySelector('#question-title, .result h2')?.focus(); }, 'primary'));
    }
    else if (!isRush && (phase === 'showing' || phase === 'answering'))
        quiz.append(button('Skip round', () => finish(null), 'secondary perception-skip'));
}
function drawResults() {
    showGameProgress();
    const result = el('div', undefined, 'result'), total = session.answers.reduce((n, a) => n + a.points, 0), h = el('h2', `${total} / 500 points`);
    h.tabIndex = -1;
    const list = el('ol', undefined, 'perception-recap');
    for (const a of session.answers)
        list.append(el('li', `${a.points} / 100 · ${a.detail}`));
    result.append(h, list);
    const status = el('p');
    status.setAttribute('role', 'status');
    result.append(button('Copy results', () => { const text = `${game} ${mode === 'daily' ? day : 'Practice'}${hard && mode === 'practice' ? ' · Hard' : ''}\n${total} / 500 points\n${session.answers.map((a, i) => `${i + 1}. ${a.points}/100`).join('\n')}\n${location.origin}/${game}/`; void navigator.clipboard.writeText(text).then(() => status.textContent = 'Results copied.').catch(() => { const textArea = el('textarea'); textArea.value = text; textArea.setAttribute('aria-label', 'Results to copy'); result.append(textArea); textArea.select(); }); }));
    result.append(button(mode === 'daily' ? 'Play practice' : 'New set', () => { if (mode === 'daily')
        switchMode('practice');
    else {
        session = { seed: `practice:${crypto.randomUUID()}`, answers: [] };
        save();
        reset();
    } }, 'primary'), status);
    quiz.append(result);
    reportDaily('complete', `${total} / 500 points`, day);
}
function draw() {
    quiz.replaceChildren();
    for (const control of document.querySelectorAll('.modes button'))
        control.setAttribute('aria-pressed', String(control.id === mode));
    const settings = document.querySelector('#perception-settings');
    if (settings)
        settings.hidden = mode !== 'practice' || inFeed;
    if (phase === 'results')
        drawResults();
    else {
        drawRound();
        reportDaily('playing', undefined, day);
    }
}
async function init() {
    await waitForFeedActivation();
    load();
    save();
    transition('reset');
    if (isRush) {
        const saved = readRushDraft();
        if (saved?.phase === 'answering' && Number.isFinite(saved.draft) && saved.draft >= 0 && saved.draft <= (game === 'anglerot' ? 360 : 100) && game !== 'temporot') {
            transition('start');
            transition('shown');
            draft = saved.draft;
        }
        saveRushDraft(() => ({ phase, draft, count: quiz.querySelector('#dot-count')?.value }));
    }
    for (const control of document.querySelectorAll('.modes button'))
        control.onclick = () => switchMode(control.id === 'practice' ? 'practice' : 'daily');
    if (!inFeed) {
        const settings = el('div', undefined, 'perception-settings');
        settings.id = 'perception-settings';
        const label = el('label', 'Practice variation'), select = el('select');
        select.id = 'variation';
        label.htmlFor = select.id;
        for (const [value, text] of [['standard', 'Standard'], ['hard', 'Hard']]) {
            const option = el('option', text);
            option.value = value;
            select.append(option);
        }
        select.onchange = () => { hard = select.value === 'hard'; reset(); };
        settings.append(label, select);
        quiz.before(settings);
    }
    document.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && game === 'temporot' && phase === 'answering' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        tap();
    } });
    document.addEventListener('visibilitychange', () => { if (!isRush && document.hidden && ['showing', 'answering'].includes(phase)) {
        stop();
        transition('reset');
        draw();
    }
    else if (!document.hidden)
        checkDate(); });
    window.addEventListener('message', event => { if (!isRush || event.source !== parent || event.origin !== location.origin)
        return; if (event.data === 'rush-pause')
        pausePlayback(); if (event.data === 'rush-resume')
        resumePlayback(); });
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', () => checkDate());
    setInterval(() => checkDate(), 30000);
    onRushTimeout(() => { if (phase === 'ready')
        transition('start'); finish(null); });
    draw();
    const countDraft = readRushDraft()?.count;
    if (typeof countDraft === 'string' && /^\d{0,3}$/.test(countDraft) && quiz.querySelector('#dot-count'))
        quiz.querySelector('#dot-count').value = countDraft;
    if (isRush)
        reportRush('ready');
}
void init();
//# sourceMappingURL=perception-game.js.map