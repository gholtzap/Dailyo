import './help.js';
import {
  makeSet, newSession, phase, preparePuzzles, rankingPuzzle, restoreSession, roundCount, scoreAnswer, scoreSet, transition,
} from './rot-puzzles.js';
import { dailyDate as today, inFeed, reportDaily, waitForFeedActivation, rushRound, reportRush, onRushTimeout, rushSeed, startPractice } from '../daily/bridge.js';
import { showRank } from '../daily/rank.js';

const kind = document.body.dataset.game;
const quiz = document.querySelector('#quiz');
const modes = [...document.querySelectorAll('.modes button')];
const key = part => `dailyo:${kind}:${kind === 'borderrot' && part !== 'mode' ? 'v2' : 'v1'}:${part}`;
const read = part => { try { return JSON.parse(localStorage.getItem(key(part))); } catch { return null; } };
const write = (part, value) => { try { localStorage.setItem(key(part), JSON.stringify(value)); } catch {} };
const randomSeed = () => String(crypto.randomUUID?.() ?? Math.random());
const number = new Intl.NumberFormat('en');
const mapGame = kind === 'maprot';
const yearGame = kind === 'yearrot';
const sessions = {};
let mode = startPractice || (!inFeed && read('mode') === 'practice') ? 'practice' : 'daily';
let data, day;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, callback, className = 'secondary') {
  const node = element('button', text, className);
  node.type = 'button';
  node.onclick = callback;
  return node;
}

function mountSession(slot, seed) {
  const questions = makeSet(kind, data, seed);
  return { slot, questions, state: restoreSession(kind, data, questions, read(slot), seed) };
}

function resetDay() {
  const nextDay = today();
  if (nextDay === day) return;
  day = nextDay;
  sessions.daily = mountSession(`daily:${day}`, day);
  if (mode === 'daily') draw();
}

function selectMode(next) {
  mode = next;
  write('mode', mode);
  resetDay();
  draw();
}

function update(action, paint = true) {
  const session = sessions[mode];
  const next = transition(kind, data, session.questions, session.state, action);
  if (next === session.state) return false;
  session.state = next;
  if(rushRound!==null){
    if(paint)draw();
    if(phase(next)==='review'){
      const score=scoreAnswer(kind,session.questions[0],next.answers[0]);
      reportRush('answered',mapGame?score<=500:score===1);
    }
    return true;
  }
  write(session.slot, next);
  if (paint) draw();
  if (paint && phase(next) === 'review') document.querySelector('.rot-next')?.focus();
  if (action.type === 'next') document.querySelector('#round-title')?.focus();
  return true;
}

function svg(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function marker(point, type) {
  return svg('circle', { cx: point[0] + 180, cy: 90 - point[1], r: 3.1, class: `rot-pin ${type}` });
}

function coordinates([lon, lat]) {
  return `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(1)}° ${lon < 0 ? 'W' : 'E'}`;
}

function drawMap(question, state, reviewing) {
  const [city, country, lon, lat] = question;
  const heading = element('h2', `Find ${city}`);
  const map = svg('svg', {
    viewBox: '0 0 360 180', class: reviewing ? 'rot-map' : 'rot-map rot-picking',
    role: reviewing ? 'img' : 'group',
    'aria-label': reviewing ? `World map showing your pin and ${city}` : 'World map. Use arrow keys to move the pin.',
    ...(reviewing ? {} : { tabindex: 0 }),
  });
  map.append(svg('path', { d: data.land, class: 'rot-land', 'fill-rule': 'evenodd' }));
  const feedback = element('div', undefined, 'rot-feedback');
  feedback.setAttribute('role', 'status');
  if (reviewing) {
    const guess = state.answers[state.index];
    if(!guess){
      map.append(marker([lon,lat],'answer'));
      feedback.append(element('p',`${city}, ${country} · ${coordinates([lon,lat])}`));
      return [heading,map,feedback];
    }
    map.append(marker(guess, 'guess'), marker([lon, lat], 'answer'));
    feedback.append(element('p', `${number.format(scoreAnswer(kind, question, guess))} km away`),
      element('p', `Yellow pin: your guess at ${coordinates(guess)}. Green pin: ${city}, ${country}.`));
    return [heading, map, feedback];
  }

  const pointLabel = element('p', state.draft.length ? `Your pin: ${coordinates(state.draft)}` :
    'Tap the map or use the arrow keys to move your pin.', 'rot-coordinate');
  pointLabel.setAttribute('role', 'status');
  const submit = button('Check pin', () => update({ type: 'submit' }), 'primary');
  submit.disabled = !state.draft.length;
  let pin = state.draft.length ? marker(state.draft, 'guess') : null;
  if (pin) map.append(pin);

  function move(point) {
    const bounded = point.map((value, index) => Math.round(Math.max(-[180, 90][index], Math.min([180, 90][index], value)) * 100) / 100);
    if (!update({ type: 'position', point: bounded }, false)) return;
    pin?.remove();
    pin = marker(bounded, 'guess');
    map.append(pin);
    pointLabel.textContent = `Your pin: ${coordinates(bounded)}`;
    submit.disabled = false;
  }
  map.onclick = event => {
    const matrix = map.getScreenCTM();
    if (!matrix) return;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (x >= 0 && x <= 360 && y >= 0 && y <= 180) move([x - 180, 90 - y]);
  };
  map.onkeydown = event => {
    const shift = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!Array.isArray(shift)) return;
    event.preventDefault();
    const point = sessions[mode].state.draft;
    const step = event.shiftKey ? 1 : 5;
    move(shift.map((direction, index) => (point[index] ?? 0) + direction * step));
  };
  const actions = element('div', undefined, 'rot-actions');
  actions.append(submit);
  return [heading, map, pointLabel, actions];
}

function drawTimeline(question, state, reviewing) {
  const { event, timeline } = question;
  const heading = element('h2', event[1]);
  const list = element('ol', undefined, 'rot-timeline');
  list.setAttribute('aria-label', 'Timeline');
  const addEvent = ([year, description], highlight = false) => {
    const row = element('li', undefined, `rot-event${highlight ? ' highlight' : ''}`);
    const date = element('time', String(year));
    date.dateTime = String(year);
    row.append(date, element('span', description));
    list.append(row);
  };
  if (reviewing) {
    const correct = scoreAnswer(kind, question, state.answers[state.index]);
    const feedback = element('p', `${correct ? 'Correct placement' : 'Correct year'} · ${event[0]}`, 'rot-feedback');
    feedback.setAttribute('role', 'status');
    for (const item of [...timeline, event].sort((a, b) => a[0] - b[0])) addEvent(item, item === event);
    return [heading, feedback, list];
  }
  for (let slot = 0; slot <= timeline.length; slot++) {
    const earlier = timeline[slot - 1], later = timeline[slot];
    const label = !earlier ? `Before ${later[0]}` : !later ? `After ${earlier[0]}` :
      `Between ${earlier[0]} and ${later[0]}`;
    const row = element('li');
    row.append(button(label, () => update({ type: 'place', slot }), 'secondary rot-slot'));
    list.append(row);
    if (later) addEvent(later);
  }
  return [heading, list];
}

function drawBorders(question, state, reviewing) {
  const start = question[0], target = question.at(-1);
  const name = id => data.graph.get(id).name;
  const heading = element('h2', `${name(start)} to ${name(target)}`);
  const chain = (countries, title) => {
    const list = element('ol', undefined, 'rot-chain');
    list.setAttribute('aria-label', title);
    for (const country of countries) list.append(element('li', name(country)));
    return list;
  };
  if (reviewing) {
    const path = state.answers[state.index];
    const best = question.length - 1;
    const correct = scoreAnswer(kind, question, path);
    const feedback = element('p', path === null ? `One shortest route crosses ${best} borders.` :
      correct ? `Shortest route · ${best} borders` : `Your route crossed ${path.length} borders. A shortest route crosses ${best}.`, 'rot-feedback');
    feedback.setAttribute('role', 'status');
    if (correct || !path) return [heading, feedback, chain(path ? [start, ...path] : question, 'Shortest route')];
    return [heading, chain([start, ...path], 'Your route'), feedback, chain(question, 'Shortest route')];
  }

  const selected = [start, ...state.draft];
  const last = selected.at(-1);
  const label = element('label', 'Add a country', 'rot-search-label');
  label.htmlFor = 'country-search';
  const input = element('input', undefined, 'country-search');
  input.id = 'country-search';
  input.type = 'search';
  input.autocomplete = 'off';
  const choices = element('div', undefined, 'choices rot-choices');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Matching countries');
  const feedback = element('p', undefined, 'rot-feedback');
  feedback.setAttribute('role', 'status');
  const normalize = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const countries = [...data.graph.values()].filter(country => !selected.includes(country.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  let matches = [];

  function add(country) {
    if (!update({ type: 'add', country: country.id })) {
      feedback.textContent = `${country.name} and ${name(last)} don’t share a land border in this game.`;
      input.focus();
    } else if (phase(sessions[mode].state) === 'guess') document.querySelector('#country-search').focus();
  }

  input.oninput = () => {
    const query = normalize(input.value.trim());
    feedback.textContent = '';
    matches = query ? countries.filter(country => normalize(country.name).startsWith(query)).slice(0, 6) : [];
    choices.replaceChildren(...matches.map(country => button(country.name, () => add(country), 'choice')));
    if (query && !matches.length) choices.append(element('p', 'No matches'));
  };
  input.onkeydown = event => {
    if (event.key !== 'Enter') return;
    const exact = matches.find(country => normalize(country.name) === normalize(input.value.trim()));
    if (exact || matches.length === 1) {
      event.preventDefault();
      add(exact ?? matches[0]);
    }
  };

  const actions = element('div', undefined, 'rot-actions');
  if (state.draft.length) actions.append(button('Undo last country', () => {
    update({ type: 'undo' });
    document.querySelector('#country-search').focus();
  }));
  actions.append(button('Show shortest route', () => update({ type: 'skip' })));
  return [heading, chain(selected, 'Your route'), label, input, choices, feedback, actions];
}

function summary(session) {
  const { scores, total } = scoreSet(kind, session.questions, session.state.answers);
  const title = element('h2', mapGame ? `${number.format(total)} km off` : `${total} out of ${roundCount}`);
  const content = [title];
  if (mode === 'daily') {
    const rank = element('div', undefined, 'daily-rank');
    showRank(rank, {game: kind, day, puzzle: rankingPuzzle(kind, session.questions), answers: session.state.answers}, total);
    content.push(rank);
  }
  if (inFeed) return content;
  const actions = element('div', undefined, 'rot-actions');
  const footer = element('div');
  if (mode === 'daily') {
    const text = [`${kind} ${day}`, mapGame ? `${title.textContent} across five cities` : title.textContent,
      mapGame ? scores.map(score => `${number.format(score)} km`).join(' · ') : scores.map(score => score ? '🟩' : '⬛').join(''),
      new URL(location.pathname, 'https://trainrot.vercel.app').href].join('\n');
    const status = element('p', undefined, 'rot-feedback');
    status.setAttribute('role', 'status');
    actions.append(button('Copy results', async () => {
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Copied results.';
      } catch {
        const label = element('label', 'Results to copy');
        label.htmlFor = 'results-to-copy';
        const copy = element('textarea', undefined, 'rot-copy');
        copy.id = 'results-to-copy';
        copy.value = text;
        copy.readOnly = true;
        status.replaceChildren(label, copy);
        copy.focus();
        copy.select();
      }
    }));
    actions.append(button('Play practice', () => {
      selectMode('practice');
      document.querySelector('#round-title')?.focus();
    }, 'primary'));
    footer.append(element('p', 'Next daily set at midnight in New York.', 'rot-coordinate'), actions, status);
  } else {
    actions.append(button('New practice set', () => {
      sessions.practice = mountSession('practice', randomSeed());
      write('practice', sessions.practice.state);
      draw();
      document.querySelector('#round-title')?.focus();
    }, 'primary'));
    footer.append(actions);
  }
  return [...content, footer];
}

function draw() {
  for (const control of modes) control.setAttribute('aria-pressed', String(control.id === mode));
  const session = sessions[mode];
  const { state, questions } = session;
  const current = phase(state);
  const counter = element('div', undefined, 'round-head rot-counter');
  counter.append(element('p', current === 'complete' ? (mode === 'daily' ? 'Daily results' : 'Practice results') :
    `Question ${state.index + 1} of ${roundCount}`));
  const question = questions[state.index];
  const content = current === 'complete' ? summary(session) :
    (mapGame ? drawMap : yearGame ? drawTimeline : drawBorders)(question, state, current === 'review');
  const heading = content[0];
  heading.id = 'round-title';
  heading.tabIndex = -1;
  if (current === 'review' && rushRound===null) {
    const next = element('div', undefined, 'rot-actions');
    next.append(button(state.index === roundCount - 1 ? 'See results' : 'Next question',
      () => update({ type: 'next' }), 'primary rot-next'));
    content.push(next);
  }
  quiz.replaceChildren(...(rushRound===null?[counter,...content]:content));
  reportDaily(current === 'complete' ? 'complete' : 'playing', current === 'complete' ? heading.textContent : undefined, day);
}

async function start() {
  const response = await fetch(`/games/data/${kind}.json`);
  if (!response.ok) throw new Error('Game data unavailable');
  data = preparePuzzles(kind, await response.json());
  if(rushRound!==null){
    const seed=rushSeed(kind);
    const question=makeSet(kind,data,seed)[rushRound];
    sessions.daily={questions:[question],state:newSession(seed)};
    if(mapGame)quiz.closest('main').querySelector('.heading p').textContent='Place your pin within 500 km.';
    onRushTimeout(()=>{
      const session=sessions.daily;
      if(phase(session.state)!=='guess')return;
      session.state={...session.state,answers:[null]};
      draw();
    });
    draw();
    reportRush('ready');
    return;
  }
  await waitForFeedActivation();
  const saved = read('practice');
  const seed = typeof saved?.seed === 'string' && saved.seed.length < 100 ? saved.seed : randomSeed();
  sessions.practice = mountSession('practice', seed);
  if (!saved || saved.seed !== seed) write('practice', sessions.practice.state);
  resetDay();
  for (const control of modes) control.onclick = () => selectMode(control.id);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resetDay(); });
  setInterval(resetDay, 30_000);
  draw();
}

start().catch(() => {
  reportRush('error');
  reportDaily('error');
  const error = element('p', 'The game could not load.', 'rot-feedback');
  error.setAttribute('role', 'alert');
  quiz.replaceChildren(error, button('Reload game', () => location.reload(), 'primary'));
});
