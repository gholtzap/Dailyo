import type {JsonValue, Mode} from '../types.js';
import './help.js';
import {dailyDate, inFeed, reportDaily, waitForFeedActivation, rushRound, reportRush, onRushTimeout, rushSeed, startPractice} from '../daily/bridge.js';
import {showRank} from '../daily/rank.js';
import {parseDifficulty, practiceSettings, practiceSlot} from './difficulty.js';
import type {PracticeDifficulty} from './difficulty.js';
import {isVisualGame, prepareVisual, visualSet, visualPuzzle, emptyAnswer, validAnswer, answered, answerPoints, gradeVisual, priceError, rushCorrect, photoScale, photoPoints} from './visual-puzzles.js';
import type {VisualGame, VisualItem, VisualQuestion, VisualAnswer} from './visual-puzzles.js';

const gameName = document.body.dataset.game ?? '';
if (!isVisualGame(gameName)) throw new Error('Unknown game');
const game: VisualGame = gameName;
const quiz = document.querySelector<HTMLElement>('#quiz')!;
const controls = [...document.querySelectorAll<HTMLButtonElement>('.modes button')];
const photoGame = game !== 'orderrot' && game !== 'pricerot';
const isRush = rushRound !== null;
const storageKey = (slot: string) => `dailyo:${game}:v1:${slot}`;
function read(slot: string): JsonValue { try { return JSON.parse(localStorage.getItem(storageKey(slot)) ?? 'null') as JsonValue; } catch { return null; } }
function write(slot: string, value: {seed: string; answers: VisualAnswer[]} | Mode | PracticeDifficulty) { try { localStorage.setItem(storageKey(slot), JSON.stringify(value)); } catch {} }
const freshSeed = () => `practice:${crypto.randomUUID()}`;
interface Session { seed: string; questions: VisualQuestion[]; answers: VisualAnswer[]; index: number }
let rows: VisualItem[] = [];
let day = dailyDate();
let mode: 'daily' | 'practice' = startPractice || (!inFeed && read('mode') === 'practice') ? 'practice' : 'daily';
let sessions: Record<'daily' | 'practice', Session>;
let draft: string[] = [];
let imageFailed = false;
let focusNext = false;
let difficulty = parseDifficulty(read('difficulty'));
let settings: ReturnType<typeof practiceSettings> | undefined;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function button(text: string, callback: () => void, className = 'secondary') {
  const node = el('button', text, className); node.type = 'button'; node.onclick = callback; return node;
}
function mount(seed: string, saved?: JsonValue, level: PracticeDifficulty = 'standard'): Session {
  const questions = visualSet(game, rows, seed, isRush, rushRound ?? 0, level);
  const session: Session = {seed, questions, answers: questions.map(emptyAnswer), index: 0};
  if (saved && typeof saved === 'object') {
    const candidate = saved as Partial<Session>;
    if (candidate.seed === seed && Array.isArray(candidate.answers) && candidate.answers.length === questions.length && candidate.answers.every((a,i)=>validAnswer(game,questions[i]!,a))) {
      const answers = candidate.answers;
      let first = answers.findIndex((a,i)=>!answered(game,questions[i]!,a));
      if (first < 0) first = questions.length;
      // Saved progress must be a consecutive prefix followed by at most one partial answer.
      if (answers.slice(first+1).every(a=>JSON.stringify(a) === JSON.stringify(emptyAnswer()))) {
        session.answers = answers;
        session.index = first;
      }
    }
  }
  return session;
}
function save() { if (!isRush) write(mode === 'daily' ? `daily:${day}` : practiceSlot(difficulty), {seed: sessions[mode].seed, answers: sessions[mode].answers}); }
function resetDay() {
  if (isRush || dailyDate() === day) return false;
  day = dailyDate(); sessions.daily = mount(day, read(`daily:${day}`));
  draft = []; imageFailed = false; return true;
}
function selectMode(next: 'daily' | 'practice') { mode = next; resetDay(); write('mode',mode); draft=[]; imageFailed=false; draw(); }
function current() { const s=sessions[mode]; return {s,q:s.questions[s.index]!,a:s.answers[s.index]!}; }
function commit(answer: VisualAnswer) {
  if (resetDay() && mode === 'daily') { draw(); return; }
  const {s,q,a}=current();
  if (!q || answered(game,q,a) || !validAnswer(game,q,answer)) return;
  s.answers[s.index]=answer; save(); draw();
  if (answered(game,q,answer)) {
    quiz.querySelector<HTMLElement>('#visual-feedback')?.focus();
    if (isRush) reportRush('answered',rushCorrect(game,q,answer));
  } else {
    quiz.querySelector<HTMLElement>('#visual-feedback')?.focus({preventScroll:true});
    quiz.querySelector<HTMLElement>('.visual-figure')?.scrollIntoView({block:'start',behavior:'instant'});
  }
}
const money = (cents: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
function source(item: VisualItem) {
  const details=el('details',undefined,'visual-source');
  details.append(el('summary',photoGame?'Photo & answer source':'Answer source'));
  const link=el('a',item.credit ? `${item.credit} · ${item.license ?? 'Source'}` : 'View source');
  link.href=item.source; link.target='_blank'; link.rel='noopener noreferrer';
  details.append(link);
  if(item.licenseUrl?.startsWith('https://')) {
    const license=el('a','License terms');license.href=item.licenseUrl;license.target='_blank';license.rel='noopener noreferrer';details.append(el('span',' · '),license);
  }
  if(item.image && game!=='pricerot')details.append(el('p','Image resized and cropped for gameplay.'));
  return details;
}
function media(q: VisualQuestion,a: VisualAnswer,complete: boolean) {
  const figure=el('figure',undefined,'visual-figure');
  const viewport=el('div',undefined,'visual-viewport');
  const image=el('img'); image.src=q.item.image!;
  // Alt text describes the task without disclosing the answer before submission.
  image.alt=complete ? q.item.name : game==='skyrot' ? 'Overhead photograph of the mystery city' : game==='skylinerot' ? 'Skyline photograph of the mystery city' : game==='pricerot' ? `${q.item.name}, product illustration` : 'Cropped photograph of the mystery object';
  image.draggable=false;
  const levelDifficulty = mode === 'practice' && !isRush ? difficulty : 'standard';
  const focus = levelDifficulty === 'hard' ? q.item.detailFocus ?? q.item.focus : q.item.focus;
  if(focus)image.style.transformOrigin=`${focus[0]}% ${focus[1]}%`;
  const level=complete ? 2 : a.hint;
  if (photoGame) {
    viewport.dataset.zoom=String(level);
    image.style.transform=`scale(${photoScale(game, levelDifficulty, level)})`;
  }
  viewport.dataset.kind=game;
  image.onerror=()=>{
    imageFailed=true;
    viewport.replaceChildren(el('div',undefined,'visual-image-error'));
    viewport.firstElementChild!.append(el('p','The image could not load. Reload this puzzle to try again.'),button('Reload puzzle',()=>location.reload()));
    for(const node of quiz.querySelectorAll<HTMLButtonElement>('.visual-choice, .visual-hint')) node.disabled=true;
    if(isRush)reportRush('error');
    else reportDaily('error');
  };
  viewport.append(image); figure.append(viewport);
  const caption=el('figcaption',game==='pricerot' ? 'Original product illustration' : complete ? q.item.name : game==='skylinerot' && levelDifficulty !== 'hard' ? 'Look for the buildings, waterfront, and surrounding landscape.' : `View ${a.hint+1} of 3 · ${isRush ? 'One guess' : `${photoPoints(Math.max(a.hint,a.guesses.length))} points available`}`);
  figure.append(caption); return figure;
}
function formatOrderValue(value: number, unit?: string) {
  const precision = value !== 0 && Math.abs(value) < .001 ? {maximumSignificantDigits:3} : {maximumFractionDigits:3};
  return value.toLocaleString('en-US',{...precision,useGrouping:unit !== 'CE'});
}
function reveal(q: VisualQuestion,a: VisualAnswer) {
  const content=el('div',undefined,'visual-reveal');
  const points=answerPoints(game,q,a);
  const feedback=el('h3',a.skipped ? 'Answer revealed' : `${points} / 100 points`);
  feedback.id='visual-feedback'; feedback.tabIndex=-1;
  const status=el('div'); status.setAttribute('role','status'); status.append(feedback); content.append(status);
  if (game==='pricerot') {
    content.append(el('p',`Recorded price: ${money(q.item.cents!)}${a.price===null ? '' : ` · Your guess: ${money(a.price)} · ${Math.round(priceError(a.price,q.item.cents!)*100)}% off`}`));
  } else if (game==='orderrot') {
    const list=el('ol',undefined,'visual-solution');
    for(const item of [...q.tiles].sort((x,y)=>x.value-y.value)) list.append(el('li',`${item.name} — ${formatOrderValue(item.value,q.item.unit)} ${q.item.unit ?? ''}`));
    content.append(el('p','Correct order, from lowest to highest:'),list);
  } else content.append(el('p',`Answer: ${q.item.name}`));
  if(q.item.explanation)content.append(el('p',q.item.explanation));
  content.append(source(q.item));
  return content;
}
function drawQuestion() {
  const {s,q,a}=current(),complete=answered(game,q,a);
  const heading=el('h2',game==='pricerot' ? q.item.name : game==='orderrot' ? q.item.name : game==='zoomrot' ? 'What is this object?' : 'Which city is this?');
  heading.id='question-title'; heading.tabIndex=-1;
  quiz.append(el('p',isRush ? 'Rush · One puzzle' : `${mode==='daily' ? day : 'Practice'} · ${s.index+1} of ${s.questions.length}`,'rot-counter'),heading);
  if(q.item.image)quiz.append(media(q,a,complete));
  if(game==='pricerot') quiz.append(el('p',`${q.item.size} · ${q.item.retailer} · United States · USD`,'visual-price-label'),el('p',`Recorded ${q.item.captured}. Guess the listed price before tax. ${isRush ? 'Within 20% counts as correct.' : 'Closer guesses earn more points.'}`,'visual-note'));
  if(complete) {
    quiz.append(reveal(q,a));
    if(!isRush)quiz.append(button(s.index===s.questions.length-1 ? 'See results' : 'Next puzzle',()=>{s.index++;draft=[];imageFailed=false;save();focusNext=true;draw();},'primary visual-next'));
    return;
  }
  if(photoGame) {
    const choices=el('div',undefined,'choices visual-choices');
    for(const option of q.options) {
      const tried=a.guesses.includes(option.id);
      const node=button(option.name,()=>{
        const guesses=[...a.guesses,option.id];
        commit({...a,guesses,hint:Math.min(2,Math.max(a.hint,guesses.length-Number(option.id===q.item.id))), skipped:isRush && option.id!==q.item.id});
      },`choice visual-choice${tried ? ' wrong' : ''}`);
      node.disabled=tried || imageFailed; choices.append(node);
    }
    const remaining=3-a.guesses.length;
    const feedback=el('p',a.guesses.length ? `Try again. ${remaining} ${remaining===1?'guess':'guesses'} left.` : a.hint ? '3 guesses left.' : '', 'rot-feedback visual-attempt-feedback');
    feedback.id='visual-feedback'; feedback.tabIndex=-1; feedback.setAttribute('role','status');
    quiz.append(feedback,choices);
    if(!isRush && (game!=='skylinerot' || (mode==='practice' && difficulty==='hard')) && a.hint<2) {
      const hint=button('Reveal a wider view',()=>commit({...a,hint:a.hint+1}),'secondary visual-hint');
      const cost=el('span', `${photoPoints(a.hint)} → ${photoPoints(a.hint+1)} points`, 'visual-hint-cost');
      hint.append(cost); quiz.append(hint);
    }
  } else if(game==='pricerot') {
    const form=el('form',undefined,'extra-form');
    const label=el('label','Your price in US dollars'); label.htmlFor='price-input';
    const input=el('input',undefined,'country-search'); input.type='number'; input.id='price-input'; input.min='0'; input.max='10000'; input.step='0.01'; input.required=true; input.inputMode='decimal'; input.placeholder='0.00'; input.autocomplete='off';
    const submit=el('button','Check price','primary'); submit.type='submit';
    form.append(label,input,submit); form.onsubmit=event=>{event.preventDefault();const price=Math.round(input.valueAsNumber*100);if(Number.isSafeInteger(price) && price>=0 && price<=1000000)commit({...a,price});}; quiz.append(form);
  } else {
    if(!draft.length)draft=q.tiles.map(x=>x.id);
    quiz.append(el('p',`Arrange ${q.tiles.length} items from lowest to highest.`,'visual-note'));
    const list=el('ol',undefined,'visual-order');
    for(const [index,id] of draft.entries()) {
      const tile=q.tiles.find(x=>x.id===id)!;
      const row=el('li'); row.append(el('span',tile.name));
      for(const [direction,offset] of [['up',-1],['down',1]] as const) {
        const move=button(direction==='up' ? 'Up' : 'Down',()=>{
          [draft[index],draft[index+offset]]=[draft[index+offset]!,draft[index]!];
          draw();
          const moved=quiz.querySelector<HTMLButtonElement>(`[data-move="${id}-${direction}"]`);
          const fallback=quiz.querySelector<HTMLButtonElement>(`[data-move="${id}-${direction==='up'?'down':'up'}"]`);
          (moved?.disabled?fallback:moved)?.focus();
        });
        move.setAttribute('aria-label',`Move ${tile.name} ${direction}`);move.dataset.move=`${id}-${direction}`;move.disabled=index+offset<0 || index+offset>=draft.length;row.append(move);
      }
      list.append(row);
    }
    quiz.append(list,button('Check order',()=>commit({...a,order:[...draft]}),'primary'));
  }
  const actions=el('div',undefined,'rot-actions');
  if(!isRush)actions.append(button('Show answer',()=>commit({...a,skipped:true})));
  if(imageFailed)actions.append(button('Reload puzzle',()=>location.reload()));
  quiz.append(actions);
}
function drawResults() {
  const s=sessions[mode];
  const score=gradeVisual(game,s.questions,s.answers) ?? 0;
  const title=el('h2',`${score} / ${s.questions.length*100} points`); title.id='question-title'; title.tabIndex=-1;
  const dots=s.answers.map((a,i)=>answerPoints(game,s.questions[i]!,a)>=65 ? '🟩' : answerPoints(game,s.questions[i]!,a)>0 ? '🟨' : '⬛').join('');
  quiz.append(title,el('p',`${mode==='daily' ? day : 'Practice'} · ${s.questions.length} puzzles completed`),el('p',dots,'visual-share-grid'));
  const review=el('ol',undefined,'visual-recap');
  for(const [i,q] of s.questions.entries()) {
    const li=el('li');li.append(el('span',q.item.name),el('span',`${answerPoints(game,q,s.answers[i]!)} / 100`));review.append(li);
  }
  quiz.append(review);
  if(mode==='daily') {
    const rank=el('div',undefined,'daily-rank');
    void showRank(rank,{game,day,puzzle:visualPuzzle(s.questions),answers:s.answers.map(a=>({...a}))},score);quiz.append(rank);
  }
  if(!inFeed) {
    const actions=el('div',undefined,'rot-actions');
    const status=el('div'); status.setAttribute('role','status');
    if(mode==='daily')actions.append(button('Copy results',()=>{void (async()=>{
      const text=`${game} ${day}\n${score} / 500 points\n${dots}\nhttps://trainrot.vercel.app/${game}/`;
      try {await navigator.clipboard.writeText(text);status.textContent='Copied results.';} catch {const area=el('textarea',undefined,'rot-copy');area.value=text;area.readOnly=true;area.setAttribute('aria-label','Results to copy');status.replaceChildren(area);area.focus();area.select();}
    })();}));
    actions.append(button(mode==='daily' ? 'Play practice' : 'New practice set',()=>{
      if(mode==='practice'){sessions.practice=mount(freshSeed(),undefined,difficulty);save();draft=[];focusNext=true;draw();}
      else selectMode('practice');
    },'primary'));
    quiz.append(actions,status);
  }
  reportDaily('complete',`${score} / 500 points`,day);
}
function draw() {
  settings?.sync(difficulty,mode==='practice');
  controls.forEach(control=>control.setAttribute('aria-pressed',String(control.id===mode)));
  quiz.replaceChildren();
  const complete=sessions[mode].index>=sessions[mode].questions.length;
  if(complete)drawResults();else {drawQuestion();reportDaily('playing',undefined,day);}
  if(focusNext){quiz.querySelector<HTMLElement>('#question-title')?.focus();focusNext=false;}
}
async function start() {
  const response=await fetch(`/games/data/${game}.json`);if(!response.ok)throw new Error('Data unavailable');
  rows=prepareVisual(game,await response.json());
  if(isRush) {
    mode='daily';sessions={daily:mount(rushSeed(game)),practice:mount(freshSeed())};
    onRushTimeout(()=>{const {q,a}=current();if(q&&!answered(game,q,a)){sessions.daily.answers[0]={...a,skipped:true};draw();}});
    draw();
    // The parent must not start the timer until the puzzle image has decoded.
    const img=quiz.querySelector('img');
    if(img)await img.decode();
    reportRush('ready');return;
  }
  await waitForFeedActivation();
  day=dailyDate();
  const practiceSession = () => {
    const saved=read(practiceSlot(difficulty));
    const seed=saved && typeof saved==='object' && 'seed' in saved && typeof saved.seed==='string' && saved.seed.startsWith('practice:') && saved.seed.length<100 ? saved.seed : freshSeed();
    return mount(seed,saved,difficulty);
  };
  sessions={daily:mount(day,read(`daily:${day}`)),practice:practiceSession()};
  if(photoGame && !inFeed) {
    settings=practiceSettings({easy: 'Wider views. A gentle place to start.', standard: 'Daily difficulty. Three guesses per photograph.', hard: 'Tighter details. More similar answer choices.'}, next=>{
      if(next===difficulty)return;
      save(); difficulty=next; write('difficulty',difficulty); sessions.practice=practiceSession();
      draft=[];imageFailed=false;save();draw();
    });
    quiz.before(settings.element);
  }
  for(const control of controls)control.onclick=()=>selectMode(control.id==='practice' ? 'practice' : 'daily');
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && resetDay() && mode==='daily')draw();});
  window.addEventListener('pageshow',()=>{if(resetDay() && mode==='daily')draw();});
  setInterval(()=>{if(resetDay() && mode==='daily')draw();},30000);
  draw();
}
void start().catch(()=>{reportRush('error');reportDaily('error');quiz.replaceChildren(el('p','The game could not load. Please try again.','rot-feedback'),button('Reload game',()=>location.reload(),'primary'));});
