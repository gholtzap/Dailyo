import './help.js';
import {dailyDate as dateToday,inFeed,reportDaily,waitForFeedActivation,rushRound,reportRush,onRushTimeout,startPractice} from '../daily/bridge.js';
import {hash,shuffle,quizDeck,quizOptions,quizPuzzle} from '../daily/puzzles.js';
import {showRank} from '../daily/rank.js';

const kind=document.body.dataset.game;
const vocabulary=kind==='vocabulary';
const quiz=document.querySelector('#quiz');
const controls={daily:document.querySelector('#daily'),practice:document.querySelector('#practice')};
const key=part=>`trainrot:${kind}:v1:${part}`;
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const randomSeed=()=>`${Date.now()}:${Math.random()}`;
const make=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const modeState={daily:null,practice:null};
let mode='daily',day,items=[];
function knownAnswer(id){
  if(typeof id!=='string')return false;
  if(vocabulary&&/:[1-3]$/.test(id))id=id.slice(0,-2);
  return items.some(item=>item.id===id);
}
function dailyState(fallback){const stored=read(key(`daily:${day}`));if(stored&&Number.isInteger(stored.index)&&stored.index>=0&&stored.index<=5&&Array.isArray(stored.answers)&&stored.answers.length>=stored.index&&stored.answers.length<=Math.min(5,stored.index+1)&&stored.answers.every(knownAnswer)&&(stored.index!==5||stored.answers.length===5))return stored;return fallback??{index:0,answers:[]};}
function practiceState(){const s=read(key('practice'));if(s&&typeof s.seed==='string'&&s.seed.length<100&&Number.isInteger(s.index)&&s.index>=0&&s.index<items.length&&Number.isInteger(s.total)&&s.total>=0&&Number.isInteger(s.correct)&&s.correct>=0&&s.correct<=s.total&&(s.selected===null||knownAnswer(s.selected)))return s;return {seed:randomSeed(),index:0,total:0,correct:0,selected:null};}
function save(){write(key(mode==='daily'?`daily:${day}`:'practice'),modeState[mode]);}
function resetDay(){const today=dateToday();if(day===today)return false;day=today;modeState.daily=dailyState();if(mode==='daily')draw();return true;}
function selectMode(next){
  resetDay();if(next===mode)return;
  mode=next;
  if(mode==='daily')modeState.daily=dailyState(modeState.daily);
  else if(!read(key('practice')))save();
  write(key('mode'),mode);draw();
}
function withCurrentProgress(action){
  if(mode!=='daily')return action();
  const current=modeState.daily,date=day;
  const update=()=>{
    if(mode!=='daily'||day!==date||modeState.daily!==current)return;
    if(resetDay()){document.querySelector('#question-title')?.focus();return;}
    const latest=dailyState(current);
    if(latest.index!==current.index||latest.answers.length!==current.answers.length||
      latest.answers.some((id,index)=>id!==current.answers[index])){
      modeState.daily=latest;draw();
      (document.querySelector('.result h2')??document.querySelector('#question-title'))?.focus();
      return;
    }
    action();
  };
  if(navigator.locks)return navigator.locks.request(key(`daily:${date}`),update);
  update();
}
function question(){const s=modeState[mode],seed=mode==='daily'?(rushRound===null?`daily:${kind}:${day}`:`rush:${kind}:${day}`):s.seed;return {item:shuffle(items,seed)[s.index],seed:`${seed}:${s.index}`};}
function statusText(selected,item){
  if(selected===item.id)return vocabulary?`Correct! ${item.name}.`:'Correct!';
  return `Correct answer: ${item.name}${vocabulary?'.':''}`;
}
function choose(id,item){
  const s=modeState[mode];
  if(rushRound!==null){
    if(s.answers[s.index]!==undefined)return;
    s.answers[s.index]=id;
    draw();
    reportRush('answered',id===item.id);
    return;
  }
  if(mode==='daily'){if(s.index>=5||s.answers.length>s.index)return;s.answers.push(id);}
  else{if(s.selected!==null)return;s.selected=id;s.total++;if(id===item.id)s.correct++;}
  save();draw();document.querySelector('#next')?.focus();
}
function advance(){
  const s=modeState[mode];
  if(mode==='daily'){if(s.index>=5||s.answers.length!==s.index+1)return;s.index++;}
  else{if(s.selected===null)return;const previous=question().item.id;s.index++;s.selected=null;if(s.index>=items.length){s.index=0;do{s.seed=randomSeed();}while(shuffle(items,s.seed)[0].id===previous&&items.length>1);}}
  save();draw();(document.querySelector('#question-title')??document.querySelector('.result h2'))?.focus();
}
function dailyProgress(){
  const state=modeState.daily,deck=quizDeck(items,kind,day),list=make('ol',undefined,'daily-progress');
  list.setAttribute('aria-label','Daily question progress');
  for(let i=0;i<5;i++){
    const status=i<state.answers.length?(state.answers[i]===deck[i].id?'correct':'incorrect'):i===state.index?'current':'upcoming';
    const dot=make('li',undefined,`progress-dot ${status}`);dot.setAttribute('aria-label',`Question ${i+1}: ${status}`);
    if(status==='correct'||status==='incorrect'){const symbol=make('span',status==='correct'?'✓':'×');symbol.setAttribute('aria-hidden','true');dot.append(symbol);}
    list.append(dot);
  }
  return list;
}
function result(){
  const s=modeState.daily,deck=quizDeck(items,kind,day),score=s.answers.filter((answer,i)=>answer===deck[i].id).length;
  const box=make('div',undefined,'result'),title=make('h2',`${score} out of 5`),description=make('p','Next daily set at midnight in New York.'),button=make('button','Play practice','secondary');
  title.tabIndex=-1;button.type='button';button.onclick=()=>selectMode('practice');box.append(title,dailyProgress(),description);if(!inFeed)box.append(button);quiz.replaceChildren(box);
  const rank=make('div',undefined,'daily-rank');
  description.before(rank);
  showRank(rank,{game:kind,day,puzzle:quizPuzzle(deck),answers:s.answers},score);
  reportDaily('complete',title.textContent,day);
}
function draw(){
  for(const [id,button] of Object.entries(controls))button.setAttribute('aria-pressed',String(id===mode));
  const s=modeState[mode];if(rushRound===null&&mode==='daily'&&s.index===5){result();return;}
  const {item,seed}=question(),selected=mode==='daily'?(s.answers[s.index]??null):s.selected;
  const head=make('div',undefined,'round-head'),counter=make('p',mode==='daily'?`Question ${s.index+1} of 5`:`Practice · ${s.total+(selected===null?1:0)}`),score=make('p',mode==='daily'?`${s.answers.slice(0,s.index+(selected!==null?1:0)).filter((v,i)=>v===shuffle(items,`daily:${kind}:${day}`)[i].id).length} correct`:`${s.correct} correct`);
  head.append(counter,score);
  const prompt=make('div',undefined,'prompt');prompt.id='question-title';prompt.tabIndex=-1;
  if(kind==='flags'){
    const image=make('img',undefined,'flag');image.src=`/games/flags/${encodeURIComponent(item.id)}.svg`;image.alt='Flag to identify';image.onerror=()=>{image.replaceWith(make('p','This flag could not be loaded.'));};prompt.append(image);
  }else if(vocabulary){
    prompt.append(make('h2',item.id,'vocabulary-word'));
  }else{const index=hash(`${seed}:sample`)%item.samples.length;const text=make('p',item.samples[index],'sample');text.dir='auto';prompt.append(text);}
  const choices=make('div',undefined,'choices');choices.setAttribute('role','group');choices.setAttribute('aria-label',kind==='flags'?'Choose a place':vocabulary?'Choose a definition':'Choose a language');
  const options=quizOptions(items,kind,item,seed);
  for(const option of options){const button=make('button',option.name,'choice');button.type='button';button.disabled=selected!==null;if(selected!==null&&option.id===item.id)button.classList.add('correct');if(selected===option.id&&selected!==item.id)button.classList.add('wrong');button.onclick=()=>rushRound===null?withCurrentProgress(()=>choose(option.id,item)):choose(option.id,item);choices.append(button);}
  const feedback=make('p',selected===null?'':statusText(selected,item),'feedback');feedback.setAttribute('role','status');
  if(selected!==null)feedback.id='answer-feedback';
  const wrong=options.find(option=>option.id===selected&&selected!==item.id);
  if(wrong){
    feedback.append(make('span',`Your answer: ${wrong.name}`,'selected-answer'));
  }
  if(vocabulary&&selected!==null){
    feedback.append(make('span',item.example,'example'));
  }
  const next=make('button',mode==='daily'&&s.index===4?'See results':'Next question','primary');next.id='next';next.type='button';next.hidden=selected===null;next.onclick=()=>withCurrentProgress(advance);
  if(feedback.id)next.setAttribute('aria-describedby',feedback.id);
  if(rushRound!==null)quiz.replaceChildren(prompt,choices,feedback);
  else if(mode==='daily')quiz.replaceChildren(head,dailyProgress(),prompt,choices,feedback,next);
  else quiz.replaceChildren(head,prompt,choices,feedback,next);
  reportDaily('playing',undefined,day);
}
async function start(){
  const response=await fetch(`/games/data/${kind}.json`);if(!response.ok)throw new Error('Could not load game data');items=await response.json();
  if(!Array.isArray(items)||items.length<5||items.some(x=>!x||typeof x.id!=='string'||typeof x.name!=='string'||(kind==='languages'&&(!Array.isArray(x.samples)||!x.samples.length))))throw new Error('Invalid game data');
  if(vocabulary&&(new Set(items.map(item=>item.id)).size!==items.length||items.some(item=>
    !/^[a-z]+$/.test(item.id)||!item.name.trim()||typeof item.example!=='string'||!item.example.trim()
    ||!Array.isArray(item.distractors)||item.distractors.length!==3
    ||item.distractors.some(option=>typeof option!=='string'||!option.trim())
    ||new Set([item.name,...item.distractors]).size!==4
  )))throw new Error('Invalid vocabulary data');
  await waitForFeedActivation();
  day=dateToday();
  if(rushRound!==null){
    modeState.daily={index:rushRound%items.length,answers:[]};
    onRushTimeout(()=>choose('',question().item));
    draw();
    await quiz.querySelector('img')?.decode();
    reportRush('ready');
    return;
  }
  modeState.daily=dailyState();modeState.practice=practiceState();const saved=read(key('mode'));mode=startPractice||(!inFeed&&saved==='practice')?'practice':'daily';
  controls.daily.onclick=()=>selectMode('daily');controls.practice.onclick=()=>selectMode('practice');
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)resetDay();});setInterval(resetDay,30000);draw();
}
start().catch(()=>{reportRush('error');reportDaily('error');const message=make('p','The game could not load.');const button=make('button','Reload game','primary');button.type='button';button.onclick=()=>location.reload();quiz.replaceChildren(message,button);});
