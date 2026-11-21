import type {Mode, ExtraGame, JsonValue} from '../types.js';
import {element as el, required} from '../dom.js';
import type {ExtraData, ExtraSession, ExtraMove, ExtraSave} from './extra-types.js';
import './help.js';
import { dailyDate, inFeed, reportDaily, waitForFeedActivation, rushRound, reportRush, onRushTimeout, rushSeed, startPractice, readRushDraft, saveRushDraft } from '../daily/bridge.js';
import { showRank } from '../daily/rank.js';
import {
  extraPuzzle, extraScoreLabel, initialExtra, moveLimit, prepareExtra, replayExtra, stepExtra, nextPracticePuzzle,
} from './extra-puzzles.js';

const game = document.body.dataset.game as ExtraGame;
const quiz = required('#quiz');
const controls = [...document.querySelectorAll<HTMLButtonElement>('.modes button')];
const key = (slot: string) => `dailyo:${game}:v1:${slot}`;
const read = <T>(slot: string): T | null => { try { return JSON.parse(localStorage.getItem(key(slot))??'null') as T | null; } catch { return null; } };
const write = (slot: string, value: object | Mode) => { try { localStorage.setItem(key(slot), JSON.stringify(value)); } catch {} };
const seed = () => `practice:${crypto.randomUUID?.() ?? Math.random()}`;
const ladder = game === 'ladderrot';
const clue = game === 'cluerot';
const scale = game === 'scalerot';
const sessions = {} as Record<Mode, ExtraSession>;
let mode: Mode = startPractice || (!inFeed && read('mode') === 'practice') ? 'practice' : 'daily';
let day: string, data: ExtraData, selected: number | undefined;


function button(text: string, callback: () => void, className = 'secondary') {
  const node = el('button', text, className);
  node.type = 'button';
  node.onclick = callback;
  return node;
}

function list(items: (string | number)[], label: string, className: string) {
  const node = el('ol', undefined, className);
  node.setAttribute('aria-label', label);
  for (const item of items) node.append(el('li', String(item)));
  return node;
}

function mount(slot: string, token: string): ExtraSession {
  const puzzle = extraPuzzle(game, data, token);
  const saved = read<ExtraSave>(slot);
  const state = saved?.token === token && saved.puzzle === puzzle.id && replayExtra(game, puzzle, saved.moves);
  return { slot, token, puzzle, state: state || initialExtra(game, puzzle), cycle: state ? saved?.cycle ?? null : null };
}

function save(session: ExtraSession) {
  write(session.slot!, { token: session.token, puzzle: session.puzzle.id, moves: session.state.moves, cycle: session.cycle });
}

function resetDay() {
  const next = dailyDate();
  if (next === day) return false;
  day = next;
  sessions.daily = mount(`daily:${day}`, day);
  if (mode === 'daily') selected = undefined;
  return true;
}

function selectMode(next: Mode) {
  mode = next;
  selected = undefined;
  resetDay();
  write('mode', mode);
  draw();
}

function move(value: ExtraMove) {
  if (rushRound===null && resetDay() && mode === 'daily') { draw(); return true; }
  const session = sessions[mode];
  let next = stepExtra(game, session.puzzle, session.state, value);
  if (next === session.state) return false;
  if(rushRound!==null && clue && value!=='' && next.phase!=='complete'){
    next=stepExtra(game,session.puzzle,session.state,null);
  }
  session.state = next;
  if(rushRound===null)save(session);
  else if(next.phase==='complete'){
    reportRush('answered',next.score!==null&&(!scale||next.score<=1000));
  }
  selected = undefined;
  draw();
  if (next.phase === 'complete') quiz.querySelector('h2')!.focus();
  else if (ladder || clue) quiz.querySelector('input')?.focus();
  else quiz.querySelectorAll<HTMLElement>('.swap-tile')[typeof value === 'number' ? value : 0]?.focus();
  return true;
}

function form(labelText: string, type: string, submit: string, parse: (input: HTMLInputElement) => ExtraMove, feedback: HTMLElement, invalid: string) {
  const form = el('form', undefined, 'extra-form');
  const label = el('label', labelText);
  const input = el('input', undefined, 'country-search');
  input.id = 'extra-input';
  input.type = type;
  input.required = true;
  input.autocomplete = 'off';
  label.htmlFor = input.id;
  input.spellcheck = false;
  if (type === 'number') {
    input.step = 'any';
    input.min = '-1000000000';
    input.max = '1000000000';
  } else input.maxLength = ladder ? 4 : 80;
  const check = el('button', submit, 'primary');
  check.type = 'submit';
  form.append(label, input, check);
  form.onsubmit = event => {
    event.preventDefault();
    if (!move(parse(input))) feedback.textContent = invalid;
  };
  return form;
}

function drawPlaying({ puzzle, state }: ExtraSession): HTMLElement[] {
  const feedback = el('p', undefined, 'rot-feedback');
  feedback.setAttribute('role', 'status');
  const actions = el('div', undefined, 'rot-actions');
  if (puzzle.game === 'ladderrot') {
    const heading = el('h2', `${puzzle.start.toUpperCase()} to ${puzzle.goal.toUpperCase()}`);
    const chain = list(state.path.map(word => word.toUpperCase()), 'Your word ladder', 'rot-chain ladder-chain');
    const text = el('p', `${state.moves.length} ${state.moves.length === 1 ? 'move' : 'moves'} · ${puzzle.solution.length-1} minimum`, 'extra-metric');
    if (state.path.length > 1 && rushRound === null) actions.append(button('Undo last word', () => move('undo')));
    actions.append(button('Show solution', () => move(null),'secondary reveal-answer'));
    return [heading, text, chain, form('Next word', 'text', 'Add word', input => input.value.trim().toLowerCase(),
      feedback, 'Enter a new four-letter word that changes exactly one letter.'), feedback, actions];
  }
  if (puzzle.game === 'cluerot') {
    const heading = el('h2', `Clue ${state.clue+1} of ${puzzle.clues.length}`);
    const clues = list(puzzle.clues.slice(0, state.clue+1), 'Revealed clues', 'clue-list');
    if (state.moves.at(-1)) feedback.textContent = 'Try again with the new clue.';
    if (state.clue < puzzle.clues.length-1) actions.append(button('Next clue', () => move('')));
    actions.append(button('Show answer', () => move(null),'secondary reveal-answer'));
    return [heading, clues, form('Your guess', 'text', 'Guess', input => input.value.trim(), feedback,
      'Enter a guess.'), feedback, actions];
  }
  if (puzzle.game === 'scalerot') {
    return [el('h2', puzzle.prompt), ...(rushRound===null?[]:[el('p','Estimate within 10%.','rot-feedback')]), form(`Estimate in ${puzzle.unit}`, 'number', 'Check estimate',
      input => input.valueAsNumber, feedback, 'Enter a number between −1 billion and 1 billion.'), feedback];
  }

  if (puzzle.game !== 'swaprot') throw new Error('Unexpected puzzle');
  const board = el('div', undefined, 'swap-board');
  board.setAttribute('role', 'group');
  board.setAttribute('aria-label', 'Tiles in order');
  for (const [index, tile] of state.board.entries()) {
    const tileButton = button(String(tile), () => {
      if (selected !== undefined && Math.abs(selected-index) === 1) {
        move(Math.min(selected, index));
        return;
      }
      selected = selected === index ? undefined : index;
      for (const [i, node] of [...board.children].entries()) node.setAttribute('aria-pressed', String(i === selected));
      feedback.textContent = selected === undefined ? 'Choose a tile.' : `Selected ${tile}. Choose a tile beside it.`;
    }, 'swap-tile secondary');
    tileButton.setAttribute('aria-label', `Tile ${tile}, position ${index+1}`);
    tileButton.setAttribute('aria-pressed', String(index === selected));
    board.append(tileButton);
  }
  return [el('h2', 'Put 1–7 in order'), el('p', `${state.moves.length} moves · ${puzzle.minimum} minimum`, 'extra-metric'), board, feedback];
}

function result({ puzzle, state }: ExtraSession): HTMLElement[] {
  const heading = el('h2', extraScoreLabel(game, state.score));
  const content: HTMLElement[] = [heading];
  if (puzzle.game === 'scalerot') {
    const number = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 3 });
    const answer=`Answer: ${number(puzzle.actual)} ${puzzle.unit}.`;
    content.push(el('p', state.score===null?answer:`Your estimate: ${number(state.moves[0] as number)} ${puzzle.unit}. ${answer}`, 'rot-feedback'),
      el('p', puzzle.explanation, 'rot-feedback'));
  } else if (puzzle.game === 'ladderrot') {
    const minimum = puzzle.solution.length - 1;
    content.push(el('p', `Fewest possible moves: ${minimum}`, 'rot-feedback'));
    if (state.score !== null) {
      content.push(el('h3', 'Your ladder', 'solution-label'), list(state.path.map(word => word.toUpperCase()), 'Your word ladder', 'rot-chain ladder-chain'));
      if (state.score === minimum) content.push(el('p', 'You found a shortest solution.', 'rot-feedback'));
      const review = el('details', undefined, 'solution-review');
      review.append(el('summary', 'See a shortest solution'), list(puzzle.solution.map(word => word.toUpperCase()), 'Shortest solution', 'rot-chain ladder-chain'));
      content.push(review);
    } else content.push(list(puzzle.solution.map(word => word.toUpperCase()), 'Shortest solution', 'rot-chain ladder-chain'));
  } else if (puzzle.game === 'cluerot') content.push(el('p', puzzle.answer, 'rot-feedback'));
  else if (puzzle.game === 'swaprot') {
    content.push(el('p', `Fewest possible moves: ${puzzle.minimum}`, 'rot-feedback'));
    if(state.score===null)content.push(list([...puzzle.board].sort((a,b)=>a-b),'Sorted tiles','rot-chain'));
  }

  if (rushRound===null && mode === 'daily' && state.score !== null && day === dailyDate()) {
    const rank = el('div', undefined, 'daily-rank');
    showRank(rank, { game, day, puzzle: puzzle.id, answers: state.moves }, state.score);
    content.push(rank);
  }
  if (inFeed) return content;
  const actions = el('div', undefined, 'rot-actions');
  if (mode === 'practice') {
    actions.append(button('New puzzle', () => {
      if (mode !== 'practice' || sessions.practice.state.phase !== 'complete') return;
      const next = nextPracticePuzzle(data,seed().slice('practice:'.length),sessions.practice.puzzle.id,sessions.practice.cycle ?? null);
      sessions.practice = {...mount('practice', next.token), cycle: next.cycle};
      save(sessions.practice);
      draw();
      quiz.querySelector('h2')!.focus();
    }, 'primary'));
  } else {
    const status = el('p', undefined, 'rot-feedback');
    status.setAttribute('role', 'status');
    actions.append(button('Copy results', async () => {
      const text = `${game} ${day}\n${heading.textContent}\nhttps://trainrot.vercel.app/${game}/`;
      try { await navigator.clipboard.writeText(text); status.textContent = 'Copied results.'; }
      catch {
        const copy = el('textarea', undefined, 'rot-copy');
        copy.setAttribute('aria-label', 'Results to copy');
        copy.value = text;
        copy.readOnly = true;
        status.replaceChildren(copy);
        copy.focus();
        copy.select();
      }
    }), button('Play practice', () => selectMode('practice'), 'primary'));
    content.push(actions, status);
    return content;
  }
  content.push(actions);
  return content;
}

function draw() {
  for (const control of controls) control.setAttribute('aria-pressed', String(control.id === mode));
  const session = sessions[mode];
  const complete = session.state.phase === 'complete';
  const content = complete ? result(session) : drawPlaying(session);
  content[0].id = 'extra-title';
  content[0].tabIndex = -1;
  if (!complete && (ladder || game === 'swaprot') && session.state.moves.length) {
    const actions = el('div', undefined, 'rot-actions');
    actions.append(button('Restart puzzle', () => {
      session.state = initialExtra(game, session.puzzle);
      selected = undefined;
      if(rushRound===null)save(session);
      draw();
      quiz.querySelector('h2')!.focus();
    }));
    if (session.state.moves.length >= moveLimit) actions.prepend(el('p', 'Move limit reached. Restart to try again.'));
    content.push(actions);
  }
  quiz.replaceChildren(...content);
  reportDaily(complete ? 'complete' : 'playing', complete ? content[0].textContent : undefined, day);
}

async function load(name: string): Promise<JsonValue> {
  const response = await fetch(`/games/data/${name}.json`);
  if (!response.ok) throw new Error('Game data unavailable');
  return response.json();
}

async function start() {
  data = game === 'swaprot' ? prepareExtra(game) :
    prepareExtra(game, await load(game), ladder ? await load('ladder-words') : undefined);
  if(rushRound!==null){
    const puzzle=extraPuzzle(game,data,`${rushSeed(game)}:${rushRound}`);
    const session={puzzle,state:replayExtra(game,puzzle,readRushDraft<JsonValue>())||initialExtra(game,puzzle)};
    sessions.daily=session;
    saveRushDraft(()=>session.state.moves);
    onRushTimeout(()=>{
      if(session.state.phase!=='playing')return;
      session.state={...session.state,phase:'complete',score:null};
      draw();
    });
    draw();
    reportRush('ready');
    return;
  }
  await waitForFeedActivation();
  const saved = read<ExtraSave>('practice');
  const token = typeof saved?.token === 'string' && saved.token.startsWith('practice:') && saved.token.length < 100 ?
    saved.token : seed();
  sessions.practice = mount('practice', token);
  if (!inFeed) save(sessions.practice);
  resetDay();
  for (const control of controls) control.onclick = () => selectMode(control.id as Mode);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && resetDay() && mode === 'daily') draw(); });
  setInterval(() => { if (resetDay() && mode === 'daily') draw(); }, 30000);
  draw();
}

start().catch(() => {
  reportRush('error');
  reportDaily('error');
  quiz.replaceChildren(el('p', 'The game could not load.', 'rot-feedback'),
    button('Reload game', () => location.reload(), 'primary'));
});
