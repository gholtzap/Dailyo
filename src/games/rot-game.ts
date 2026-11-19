import type {Mode, RotGame, Coordinate} from '../types.js';
import type {RotData, RotState, RotSession, RotAction, Place, YearQuestion, YearEvent, Country, BorderGeometry} from './rot-types.js';
import {element, required} from '../dom.js';
type Content = (HTMLElement | SVGElement | null)[];
import {showGameProgress} from './help.js';
import {
  makeSet, newSession, phase, preparePuzzles, rankingPuzzle, restoreSession, roundCount, scoreAnswer, scoreSet, transition,
} from './rot-puzzles.js';
import { dailyDate as today, inFeed, reportDaily, waitForFeedActivation, rushRound, reportRush, onRushTimeout, rushSeed, startPractice } from '../daily/bridge.js';
import { showRank } from '../daily/rank.js';
import {searchCountries, exactCountryMatch} from './country-search.js';
import {parseDifficulty, practiceSettings, practiceSlot} from './difficulty.js';
import type {PracticeDifficulty} from './difficulty.js';

const kind = document.body.dataset.game as RotGame;
const quiz = required('#quiz');
const modes = [...document.querySelectorAll<HTMLButtonElement>('.modes button')];
const key = (part: string) => `dailyo:${kind}:${kind === 'borderrot' && part !== 'mode' ? 'v2' : 'v1'}:${part}`;
const read = (part: string): RotState | null => { try { return JSON.parse(localStorage.getItem(key(part))??'null') as RotState | null; } catch { return null; } };
const write = (part: string, value: RotState | Mode | PracticeDifficulty) => { try { localStorage.setItem(key(part), JSON.stringify(value)); } catch {} };
function readMode(): Mode | null { try { return JSON.parse(localStorage.getItem(key('mode'))??'null') as Mode | null; } catch { return null; } }
const randomSeed = () => String(crypto.randomUUID?.() ?? Math.random());
const number = new Intl.NumberFormat('en');
const mapGame = kind === 'maprot';
const yearGame = kind === 'yearrot';
const sessions = {} as Record<Mode, RotSession>;
let mode: Mode = startPractice || (!inFeed && readMode() === 'practice') ? 'practice' : 'daily';
let difficulty = parseDifficulty(read('difficulty'));
let settings: ReturnType<typeof practiceSettings> | undefined;
let data: RotData, day: string, borderGeometry: {paths: [string, Path2D][]; anchors: Record<string, Coordinate>} | null;


function button(text: string, callback: () => void, className = 'secondary') {
  const node = element('button', text, className);
  node.type = 'button';
  node.onclick = callback;
  return node;
}

function mountSession(slot: string, seed: string, level: PracticeDifficulty = 'standard'): RotSession {
  const questions = makeSet(kind, data, seed, 0, level);
  return { slot, questions, state: restoreSession(kind, data, questions, read(slot), seed) };
}

function resetDay() {
  const nextDay = today();
  if (nextDay === day) return;
  day = nextDay;
  sessions.daily = mountSession(`daily:${day}`, day);
  if (mode === 'daily') draw();
}

function selectMode(next: Mode) {
  mode = next;
  write('mode', mode);
  resetDay();
  draw();
}

function update(action: RotAction, paint = true) {
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
  write(session.slot!, next);
  if (paint) draw();
  if (paint && phase(next) === 'review') document.querySelector<HTMLElement>('.rot-next')?.focus();
  if (action.type === 'next') document.querySelector<HTMLElement>('#round-title')?.focus();
  return true;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function marker(point: number[], type: string, radius = 3.1) {
  return svg('circle', { cx: point[0] + 180, cy: 90 - point[1], r: radius, class: `rot-pin ${type}` });
}

function zoomToPins(map: SVGSVGElement, guess: Coordinate, [lon, lat]: Coordinate) {
  // Place the guess on the nearest copy of the world when the points straddle the date line.
  const guessLon = lon + ((guess[0] - lon + 540) % 360) - 180;
  const x1 = guessLon + 180, y1 = 90 - guess[1];
  const x2 = lon + 180, y2 = 90 - lat;
  const width = Math.max(12, Math.abs(x2 - x1) * 1.24, Math.abs(y2 - y1) * 2.48);
  const height = width / 2;
  const left = (x1 + x2 - width) / 2;
  const top = (y1 + y2 - height) / 2;
  map.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
  map.classList.add('rot-zoomed');
  for (const shift of [-360, 360]) {
    if (shift < 0 ? left >= 0 : left + width <= 360) continue;
    const wrappedLand = map.firstElementChild!.cloneNode() as SVGElement;
    wrappedLand.setAttribute('transform', `translate(${shift} 0)`);
    map.append(wrappedLand);
  }
  map.append(svg('line', { x1, y1, x2, y2, class: 'rot-connector' }),
    marker([lon, lat], 'answer', width / 115),
    marker([guessLon, guess[1]], 'guess', width / 80));
}

function coordinates([lon, lat]: number[]) {
  return `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(1)}° ${lon < 0 ? 'W' : 'E'}`;
}

function drawMap(question: Place, state: RotState, reviewing: boolean): Content {
  const [city, country, lon, lat] = question;
  const heading = element('h2', `Find ${city}`);
  const map = svg('svg', {
    viewBox: '0 0 360 180', class: reviewing ? 'rot-map' : 'rot-map rot-picking',
    role: reviewing ? 'img' : 'group',
    'aria-label': reviewing ? `World map showing your pin and ${city}` : 'World map. Use arrow keys to move the pin.',
    ...(reviewing ? {} : { tabindex: 0 }),
  });
  map.append(svg('path', { d: (data as Extract<RotData, {kind: 'maprot'}>).land, class: 'rot-land', 'fill-rule': 'evenodd', 'aria-hidden': 'true' }));
  const feedback = element('div', undefined, 'rot-feedback');
  feedback.setAttribute('role', 'status');
  if (reviewing) {
    const guess = state.answers[state.index] as Coordinate | null;
    if(!guess){
      map.append(marker([lon,lat],'answer'));
      feedback.append(element('p',`${city}, ${country} · ${coordinates([lon,lat])}`));
      return [heading,map,feedback];
    }
    zoomToPins(map, guess, [lon, lat]);
    feedback.append(element('p', `${number.format(scoreAnswer(kind, question, guess))} km away`),
      element('p', `Yellow pin: your guess at ${coordinates(guess)}. Green pin: ${city}, ${country}.`));
    return [heading, map, feedback];
  }

  const pointLabel = element('p', state.draft.length ? `Your pin: ${coordinates(state.draft as number[])}` :
    'Tap the map or use the arrow keys to move your pin.', 'rot-coordinate');
  pointLabel.setAttribute('role', 'status');
  const submit = button('Check pin', () => update({ type: 'submit' }), 'primary');
  submit.disabled = !state.draft.length;
  let pin = state.draft.length ? marker(state.draft as number[], 'guess') : null;
  if (pin) map.append(pin);

  function move(point: number[]) {
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
    const shift = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, number[]>)[event.key];
    if (!Array.isArray(shift)) return;
    event.preventDefault();
    const point = sessions[mode].state.draft as number[];
    const step = event.shiftKey ? 1 : 5;
    move(shift.map((direction, index) => ((point[index] as number) ?? 0) + direction * step));
  };
  const actions = element('div', undefined, 'rot-actions');
  actions.append(submit);
  return [heading, map, pointLabel, actions];
}

function drawTimeline(question: YearQuestion, state: RotState, reviewing: boolean): Content {
  const { event, timeline } = question;
  const heading = element('h2', reviewing ? event[1] : 'When did this happen?');
  const list = element('ol', undefined, 'rot-timeline');
  list.setAttribute('aria-label', 'Timeline');
  const addEvent = ([year, description]: YearEvent, highlight = false) => {
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
  for (const item of timeline) addEvent(item);
  const choices = element('div', undefined, 'rot-year-choices');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Choose when it happened');
  for (let slot = 0; slot <= timeline.length; slot++) {
    const earlier = timeline[slot - 1], later = timeline[slot];
    const label = !earlier ? `Before ${later[0]}` : !later ? `After ${earlier[0]}` :
      `Between ${earlier[0]} and ${later[0]}`;
    choices.append(button(label, () => update({ type: 'place', slot }), 'secondary rot-slot'));
  }
  return [heading, element('p', event[1], 'rot-year-event'), list, choices];
}

function drawBorderMap(start: string, target: string, guesses: string[]) {
  if (!borderGeometry) return null;
  const { paths, anchors } = borderGeometry;
  const selected = new Set([start, ...guesses]);
  const points = [...selected, target].map(id => anchors[id]);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const west = Math.min(...xs), east = Math.max(...xs);
  const north = Math.min(...ys), south = Math.max(...ys);
  const width = Math.max(26, (east - west) * 1.4 + 12, (south - north) * 2.8 + 12);
  const height = width / 2;
  const left = (west + east - width) / 2;
  const top = (north + south - height) / 2;
  const panel = element('div', undefined, 'border-map');
  const map = element('canvas', undefined, 'rot-map');
  map.width = 1440;
  map.height = 720;
  const context = map.getContext('2d')!;
  const scale = map.width / width;
  context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
  context.strokeStyle = '#18222b';
  context.lineWidth = 2.4 / scale;
  for (const [id, path] of paths) {
    context.fillStyle = selected.has(id) ? '#39735c' : id === target ? '#735d36' : '#354551';
    context.fill(path, 'evenodd');
  }
  for (const [, path] of paths) context.stroke(path);
  panel.append(map);
  for (const id of new Set([start, target, ...guesses])) {
    const [x, y] = anchors[id];
    const guessed = guesses.includes(id);
    const name = guessed ? (data as Extract<RotData, {kind: 'borderrot'}>).graph.get(id)!.name : undefined;
    const marker = element('span', undefined, 'border-marker');
    marker.style.left = `${(x - left) / width * 100}%`;
    marker.style.top = `${(y - top) / height * 100}%`;
    marker.classList.toggle('border-destination', !selected.has(id));
    if (name) marker.title = name;
    if (id === guesses.at(-1)) {
      marker.append(element('span', name, 'border-map-label'));
      marker.classList.toggle('border-label-left', x > left + width / 2);
    }
    panel.append(marker);
  }
  panel.setAttribute('aria-hidden', 'true');
  return panel;
}

function drawBorders(question: string[], state: RotState, reviewing: boolean): Content {
  const start = question[0], target = question.at(-1)!;
  const name = (id: string) => (data as Extract<RotData, {kind: 'borderrot'}>).graph.get(id)!.name;
  const heading = element('h2', `${name(start)} to ${name(target)}`);
  const chain = (countries: string[], title: string) => {
    const list = element('ol', undefined, 'rot-chain');
    list.setAttribute('aria-label', title);
    for (const country of countries) list.append(element('li', name(country)));
    return list;
  };
  if (reviewing) {
    const path = state.answers[state.index] as string[] | null;
    const best = question.length - 1;
    const correct = scoreAnswer(kind, question, path);
    const feedback = element('p', path === null ? `One shortest route crosses ${best} borders.` :
      correct ? `Shortest route · ${best} borders` : `Your route crossed ${path.length} borders. A shortest route crosses ${best}.`, 'rot-feedback');
    feedback.setAttribute('role', 'status');
    const map = drawBorderMap(start, target, path ?? question.slice(1));
    if (correct || !path) return [heading, map, feedback, chain(path ? [start, ...path] : question, 'Shortest route')];
    return [heading, map, chain([start, ...path], 'Your route'), feedback, chain(question, 'Shortest route')];
  }

  const selected = [start, ...state.draft as string[]];
  const last = selected.at(-1)!;
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
  const countries = [...(data as Extract<RotData, {kind: 'borderrot'}>).graph.values()].filter(country => !selected.includes(country.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  let matches: Country[] = [];

  function add(country: Country) {
    if (!update({ type: 'add', country: country.id })) {
      feedback.textContent = `${country.name} and ${name(last)} don’t share a land border in this game.`;
      input.focus();
    } else if (phase(sessions[mode].state) === 'guess') document.querySelector<HTMLElement>('#country-search')!.focus();
  }

  input.oninput = () => {
    const query = input.value.trim();
    feedback.textContent = '';
    matches = searchCountries(countries, query);
    choices.replaceChildren(...matches.map(country => button(country.name, () => add(country), 'choice')));
    if (query && !matches.length) choices.append(element('p', 'No matches'));
  };
  input.onkeydown = event => {
    if (event.key !== 'Enter') return;
    const exactMatches = matches.filter(country => exactCountryMatch(country, input.value));
    const exact = exactMatches.length === 1 ? exactMatches[0] : undefined;
    if (exact || matches.length === 1) {
      event.preventDefault();
      add(exact ?? matches[0]);
    }
  };

  const actions = element('div', undefined, 'rot-actions');
  if (state.draft.length) actions.append(button('Undo last country', () => {
    update({ type: 'undo' });
    document.querySelector<HTMLElement>('#country-search')!.focus();
  }));
  actions.append(button('Show shortest route', () => update({ type: 'skip' })));
  return [heading, drawBorderMap(start, target, state.draft as string[]), chain(selected, 'Your route'), label, input, choices, feedback, actions];
}

function questionReview(session: RotSession, scores: number[]) {
  const review = element('ol', undefined, 'rot-recap');
  review.setAttribute('aria-label', 'Review completed questions');
  session.questions.forEach((question, index) => {
    const row = element('li');
    const details = element('details');
    const title = mapGame ? (question as Place)[0] : yearGame ? (question as YearQuestion).event[1] :
      (question as string[]).filter((_,i,array)=>i===0||i===array.length-1).map(id=>(data as Extract<RotData,{kind:'borderrot'}>).graph.get(id)!.name).join(' to ');
    const score = mapGame ? `${number.format(scores[index])} km away` : session.state.answers[index] === null ? 'Answer shown' : scores[index] ? 'Correct' : 'Missed';
    const summary = element('summary');
    summary.append(element('span',title),element('span',score,'rot-recap-score'));
    details.append(summary);
    // Render a review only when opened; keep the saved result and score read-only.
    details.ontoggle = () => {
      if (!details.open || details.childElementCount > 1) return;
      const state = {...session.state,index};
      const content = mapGame ? drawMap(question as Place,state,true) : yearGame ? drawTimeline(question as YearQuestion,state,true) : drawBorders(question as string[],state,true);
      const panel = element('div',undefined,'rot-recap-detail');
      panel.append(...content.slice(1).filter((node): node is HTMLElement | SVGElement => node!==null));
      details.append(panel);
    };
    row.append(details);review.append(row);
  });
  const section = element('section',undefined,'rot-review');
  const heading = element('h3','Review answers'); heading.id='review-title';
  section.setAttribute('aria-labelledby',heading.id); section.append(heading,review);
  return section;
}

function summary(session: RotSession): Content {
  const { scores, total } = scoreSet(kind, session.questions, session.state.answers);
  const title = element('h2', mapGame ? `${number.format(total)} km off` : `${total} out of ${roundCount}`);
  const content: HTMLElement[] = [title];
  if (mode === 'daily') {
    const rank = element('div', undefined, 'daily-rank');
    showRank(rank, {game: kind, day, puzzle: rankingPuzzle(kind, session.questions), answers: session.state.answers}, total);
    content.push(rank);
  }
  content.push(questionReview(session,scores));
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
      document.querySelector<HTMLElement>('#round-title')?.focus();
    }, 'primary'));
    footer.append(element('p', 'Next daily set at midnight in New York.', 'rot-coordinate'), actions, status);
  } else {
    actions.append(button('New practice set', () => {
      sessions.practice = mountSession(practiceSlot(difficulty), randomSeed(), difficulty);
      write(practiceSlot(difficulty), sessions.practice.state);
      draw();
      document.querySelector<HTMLElement>('#round-title')?.focus();
    }, 'primary'));
    footer.append(actions);
  }
  return [...content, footer];
}

function draw() {
  settings?.sync(difficulty,mode==='practice');
  for (const control of modes) control.setAttribute('aria-pressed', String(control.id === mode));
  const session = sessions[mode];
  const { state, questions } = session;
  const current = phase(state);
  const counter = element('div', undefined, 'round-head rot-counter');
  counter.append(element('p', current === 'complete' ? (mode === 'daily' ? 'Daily results' : 'Practice results') :
    `Question ${state.index + 1} of ${roundCount}`));
  showGameProgress(rushRound===null ? counter : undefined);
  const question = questions[state.index];
  const content = current === 'complete' ? summary(session) :
    mapGame ? drawMap(question as Place, state, current === 'review') : yearGame ? drawTimeline(question as YearQuestion, state, current === 'review') : drawBorders(question as string[], state, current === 'review');
  const heading = content[0]!;
  heading.id = 'round-title';
  heading.tabIndex = -1;
  if (current === 'review' && rushRound===null) {
    const next = element('div', undefined, 'rot-actions');
    next.append(button(state.index === roundCount - 1 ? 'See results' : 'Next question',
      () => update({ type: 'next' }), 'primary rot-next'));
    content.push(next);
  }
  quiz.replaceChildren(...content.filter((node): node is HTMLElement | SVGElement => node !== null));
  reportDaily(current === 'complete' ? 'complete' : 'playing', current === 'complete' ? heading.textContent : undefined, day);
}

async function start() {
  const geometry: Promise<BorderGeometry | null> | null = kind === 'borderrot' ? fetch('/games/data/border-map.json')
    .then(response => response.ok ? response.json() : null).catch(() => null) : null;
  const response = await fetch(`/games/data/${kind}.json`);
  if (!response.ok) throw new Error('Game data unavailable');
  data = preparePuzzles(kind, await response.json());
  const rawGeometry = await geometry;
  borderGeometry = rawGeometry ? {...rawGeometry, paths: rawGeometry.paths.map(([id, path]) => [id, new Path2D(path)])} : null;
  if(rushRound!==null){
    const seed=rushSeed(kind);
    const position=rushRound%data.items.length;
    const index=position%roundCount;
    const question=makeSet(kind,data,seed,position-index)[index];
    sessions.daily={questions:[question],state:newSession(seed)};
    if(mapGame){const rule=element('p','Place your pin within 500 km.','rush-rule');quiz.closest('main')!.querySelector('.heading')!.append(rule);}
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
  const practiceSession = () => {
    const saved = read(practiceSlot(difficulty));
    const seed = typeof saved?.seed === 'string' && saved.seed.length < 100 ? saved.seed : randomSeed();
    return mountSession(practiceSlot(difficulty), seed, difficulty);
  };
  sessions.practice = practiceSession();
  write(practiceSlot(difficulty), sessions.practice.state);
  if(yearGame && !inFeed) {
    settings=practiceSettings({easy: 'Broad eras. Build your sense of history.', standard: 'Daily difficulty. A growing timeline.', hard: 'Nearby events. Find the finer distinctions.'}, next=>{
      if(next===difficulty)return;
      difficulty=next; write('difficulty',difficulty); sessions.practice=practiceSession();
      write(practiceSlot(difficulty),sessions.practice.state); draw();
    });
    quiz.before(settings.element);
  }
  resetDay();
  for (const control of modes) control.onclick = () => selectMode(control.id as Mode);
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
