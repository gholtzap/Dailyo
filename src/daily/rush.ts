import {required} from '../dom.js';
import type {RushMessage} from '../types.js';
interface Round {frame: HTMLIFrameElement; ready: boolean}
import {rushDate} from './puzzles.js';

const rotation=[
  {label:'flagrot',path:'/flags/',seconds:[8,6,4]},
  {label:'langrot',path:'/languages/',seconds:[8,6,4]},
  {label:'trainrot',path:'/trainrot/',seconds:[35,28,21]},
  {label:'Vocabulary',path:'/vocabulary/',seconds:[12,9,6]},
  {label:'maprot',path:'/maprot/',seconds:[20,15,10]},
  {label:'yearrot',path:'/yearrot/',seconds:[14,10,6]},
  {label:'borderrot',path:'/borderrot/',seconds:[45,35,25]},
  {label:'ladderrot',path:'/ladderrot/',seconds:[55,45,35]},
  {label:'cluerot',path:'/cluerot/',seconds:[20,15,10]},
  {label:'scalerot',path:'/scalerot/',seconds:[20,15,10]},
  {label:'swaprot',path:'/swaprot/',seconds:[50,40,30]},
  {label:'skyrot',path:'/skyrot/',seconds:[16,12,8]},
  {label:'pricerot',path:'/pricerot/',seconds:[18,14,10]},
  {label:'skylinerot',path:'/skylinerot/',seconds:[12,9,6]},
  {label:'zoomrot',path:'/zoomrot/',seconds:[12,9,6]},
  {label:'orderrot',path:'/orderrot/',seconds:[25,20,15]},

];
const slug=location.pathname.split('/')[2];
const selected=rotation.find(game=>game.label.toLowerCase()===slug);
const games=selected?[selected]:rotation;
const date=rushDate(new URLSearchParams(location.search).get('date'));
const bestKey=`dailyo:rush:best:${selected?slug:'all'}`;
if(selected)document.title=`${selected.label} Rush | dailyo`;
const $=required;
const panel=$('#feed-game'),status=$('#rush-status'),clock=$('#rush-clock');
const timeDisplay=$('.rush-time');
const actions=$('.feed-actions'),retry=$('#rush-retry'),next=$('#rush-next');
const scores=games.map(()=>0);
const copyStatus=$('#rush-copy-status'),copyText=$('#rush-copy-text');
let phase='loading',index=0,round=0,deadline=Infinity,duration=0;
let current: Round | null | undefined, visible: HTMLIFrameElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined, ticker: ReturnType<typeof setInterval> | undefined;
const upcoming=new Map<string, Round>();

function stopClock(){
  clearTimeout(timer);
  clearInterval(ticker);
  clock.textContent='';
  timeDisplay.removeAttribute('data-timed');
}

function makeRound(gameIndex: number,roundIndex: number){
  const frame=document.createElement('iframe');
  frame.src=`${games[gameIndex].path}?rush=${roundIndex}&date=${date}`;
  frame.className='feed-loading';
  frame.inert=true;
  panel.append(frame);
  return {frame,ready:false};
}

function preload(gameIndex: number,roundIndex: number){
  const key=`${gameIndex}:${roundIndex}`;
  if(games[gameIndex]&&!upcoming.has(key))upcoming.set(key,makeRound(gameIndex,roundIndex));
}

function openRound(gameIndex: number,roundIndex=0){
  stopClock();
  if(current?.frame!==visible)current?.frame.remove();
  index=gameIndex;
  round=roundIndex;
  const game=games[index];
  if(!game){showRecap();return;}
  phase='loading';
  retry.hidden=true;
  panel.hidden=false;
  if(visible)if (visible) visible!.inert=true;
  const key=`${index}:${round}`;
  current=upcoming.get(key);
  upcoming.delete(key);
  for(const [other,slot] of upcoming){
    if(other===`${index+1}:0`)continue;
    slot.frame.remove();
    upcoming.delete(other);
  }
  current??=makeRound(index,round);
  if(current.ready){showRound();return;}
  status.textContent=`Loading ${game.label}…`;
  timer=setTimeout(showError,12000);
}

function showError(){
  stopClock();
  phase='error';
  current?.frame.remove();
  current=null;
  status.textContent=`${games[index].label} didn’t load.`;
  retry.hidden=false;
  retry.focus();
}

function showRound(){
  stopClock();
  phase='playing';
  if (!current) return;
  const {frame}=current;
  const game=games[index];
  frame.title=game.label;
  frame.classList.remove('feed-loading');
  if(visible)frame.classList.add('rush-enter');
  visible?.remove();
  visible=frame;
  frame.inert=false;
  status.textContent=`${game.label} · Round ${round+1}`;
  const timedRound=round+Number(index>0);
  if(timedRound){
    duration=game.seconds[Math.min(timedRound,game.seconds.length)-1]*1000;
    deadline=performance.now()+duration;
    timeDisplay.dataset.timed='';
    updateClock();
    ticker=setInterval(updateClock,100);
  }else{
    deadline=Infinity;
    clock.textContent='Untimed';
  }
  frame.contentDocument?.querySelector<HTMLElement>('#question-title, #rush-journey, #round-title, #extra-title')?.focus({preventScroll:true});
  if(!document.hidden&&!navigator.connection?.saveData){
    preload(index,round+1);
    preload(index+1,0);
  }
}

function updateClock(){
  const remaining=deadline-performance.now();
  if(remaining<=0){finishRound(false,true);return;}
  clock.textContent=`${Math.ceil(remaining/1000)}s`;
  timeDisplay.style.setProperty('--rush-remaining',String(Math.min(1,remaining/duration)));
}

function finishRound(correct: boolean,expired=false){
  if(phase!=='playing')return;
  stopClock();
  phase='feedback';
  const game=games[index];
  if(correct)scores[index]++;
  status.textContent=expired?'Time’s up':correct?'Correct':'Missed';
  if(expired)visible?.contentWindow?.postMessage('rush-timeout',location.origin);
  // Disable further input while leaving the answer visible.
  if (visible) visible.inert=true;
  status.focus({preventScroll:true});
  timer=setTimeout(()=>correct?openRound(index,round+1):openRound(index+1),
    correct?180:game.path==='/trainrot/'?2200:1300);
}

function showRecap(){
  phase='recap';
  current=null;
  visible=null;
  upcoming.clear();
  panel.replaceChildren();
  panel.hidden=true;
  actions.hidden=true;
  $('#feed-recap').hidden=false;
  copyStatus.textContent='';
  copyText.hidden=true;
  const {total:sum,bestRun}=scoreSummary();
  showPersonalBest(sum);
  $('#rush-score').textContent=`${sum} correct${bestRun?` · Best run: ${bestRun}`:''}`;
  $('#feed-results').replaceChildren(...games.map((game,i)=>{
    const row=document.createElement('li');
    const score=document.createElement('span');
    score.textContent=`${game.label} · ${scores[i]} correct`;
    const link=document.createElement('a');
    link.href=`${game.path}?practice=1`;
    link.textContent='Play more';
    link.setAttribute('aria-label',`Play more ${game.label}`);
    row.append(score,link);
    return row;
  }));
  $('#feed-recap h2').focus();
}

window.addEventListener('message',(event: MessageEvent<RushMessage>)=>{
  if(event.origin!==location.origin)return;
  const {type,phase:reported,correct}=event.data??{};
  if(type!=='rush-game')return;
  if(event.source!==current?.frame.contentWindow){
    for(const [key,slot] of upcoming){
      if(event.source!==slot.frame.contentWindow)continue;
      if(reported==='ready')slot.ready=true;
      if(reported==='error'){
        slot.frame.remove();
        upcoming.delete(key);
      }
      break;
    }
    return;
  }
  if(phase==='loading'&&reported==='ready')showRound();
  if(phase==='loading'&&reported==='error')showError();
  if(phase==='playing'&&reported==='answered'&&typeof correct==='boolean'){
    const expired=performance.now()>=deadline;
    finishRound(correct&&!expired,expired);
  }
});

function scoreSummary(){
  const total=scores.reduce((sum,score)=>sum+score,0);
  const best=Math.max(...scores);
  const labels=games.filter((_,i)=>scores[i]===best).map(game=>game.label);
  return {total,bestRun:best?`${best} in ${labels.join(', ')}`:''};
}

function showPersonalBest(total: number){
  const label=$('#rush-personal-best');
  label.textContent='';
  try{
    const saved=Number(localStorage.getItem(bestKey));
    const previous=Number.isSafeInteger(saved)&&saved>0?saved:0;
    if(total>previous)localStorage.setItem(bestKey,String(total));
    if(total||previous)label.textContent=`${total>previous?'New best':'Personal best'} · ${Math.max(total,previous)} correct`;
  }catch{}
}

function shareText(){
  const title=selected?`dailyo Rush · ${selected.label}`:'dailyo Rush';
  const {total,bestRun}=scoreSummary();
  const score=`${total} correct${!selected&&bestRun?` · ${bestRun}`:''}`;
  const rows=selected?[]:['',...games.map(({label},i)=>`${label} · ${scores[i]} correct`)];
  const path=selected?`/rush/${slug}/`:'/rush/';
  return [`${title} · ${date}`,score,...rows,'',`https://trainrot.vercel.app${path}?date=${date}`].join('\n');
}

$('#rush-copy').onclick=async()=>{
  if(phase!=='recap')return;
  const text=shareText();
  let copied=false;
  try{
    await navigator.clipboard.writeText(text);
    copied=true;
  }catch{}
  if(phase!=='recap'||shareText()!==text)return;
  copyStatus.textContent=copied?'Copied':'Select and copy your results.';
  copyText.hidden=copied;
  if(!copied){
    copyText.value=text;
    copyText.focus();
    copyText.select();
  }
};

function start(){
  scores.fill(0);
  $('#feed-recap').hidden=true;
  actions.hidden=false;
  openRound(0);
  status.focus({preventScroll:true});
}
$('#rush-replay').onclick=()=>{if(phase==='recap')start();};
retry.onclick=()=>{if(phase==='error')openRound(index,round);};
next.onclick=()=>{if(['loading','playing','feedback','error'].includes(phase))openRound(index+1);};

start();
