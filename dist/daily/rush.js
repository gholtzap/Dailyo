const rotation=[
  {label:'flagrot',path:'/flags/',seconds:[8,6]},
  {label:'langrot',path:'/languages/',seconds:[8,6]},
  {label:'trainrot',path:'/trainrot/',seconds:[35,28]},
  {label:'Vocabulary',path:'/vocabulary/',seconds:[12,9]},
  {label:'maprot',path:'/maprot/',seconds:[20,15]},
  {label:'yearrot',path:'/yearrot/',seconds:[14,10]},
  {label:'borderrot',path:'/borderrot/',seconds:[45,35]},
  {label:'ladderrot',path:'/ladderrot/',seconds:[55,45]},
  {label:'cluerot',path:'/cluerot/',seconds:[20,15]},
  {label:'scalerot',path:'/scalerot/',seconds:[20,15]},
  {label:'swaprot',path:'/swaprot/',seconds:[50,40]},
];
const slug=location.pathname.split('/')[2];
const selected=rotation.find(game=>game.label.toLowerCase()===slug);
const games=selected?[selected]:rotation;
if(selected)document.title=`${selected.label} Rush | dailyo`;
const $=selector=>document.querySelector(selector);
const panel=$('#feed-game'),status=$('#rush-status'),clock=$('#rush-clock');
const actions=$('.feed-actions'),retry=$('#rush-retry'),next=$('#rush-next');
const scores=games.map(()=>0);
let phase='loading',index=0,round=0,frame,deadline,timer,ticker;

function stopClock(){
  clearTimeout(timer);
  clearInterval(ticker);
  clock.textContent='';
}

function openRound(gameIndex,roundIndex=0){
  stopClock();
  index=gameIndex;
  round=roundIndex;
  const game=games[index];
  if(!game){showRecap();return;}
  phase='loading';
  panel.hidden=false;
  retry.hidden=true;
  status.textContent=`Loading ${game.label}…`;
  frame=document.createElement('iframe');
  frame.title=game.label;
  frame.src=`${game.path}?rush=${round}`;
  frame.className='feed-loading';
  panel.replaceChildren(frame);
  timer=setTimeout(showError,12000);
}

function showError(){
  stopClock();
  phase='error';
  frame.remove();
  frame=null;
  status.textContent=`${games[index].label} didn’t load.`;
  retry.hidden=false;
  retry.focus();
}

function startClock(){
  stopClock();
  phase='playing';
  frame.classList.remove('feed-loading');
  const game=games[index];
  status.textContent=`${game.label} · Round ${round+1} of ${game.seconds.length+1}`;
  deadline=round===0?Infinity:performance.now()+game.seconds[round-1]*1000;
  frame.contentDocument.querySelector('#question-title, #rush-journey, #round-title, #extra-title')?.focus({preventScroll:true});
  if(round>0){
    updateClock();
    ticker=setInterval(updateClock,100);
  }else clock.textContent='Untimed';
}

function updateClock(){
  const remaining=deadline-performance.now();
  if(remaining<=0){finishRound(false,true);return;}
  clock.textContent=`${Math.ceil(remaining/1000)}s`;
}

function finishRound(correct,expired=false){
  if(phase!=='playing')return;
  stopClock();
  phase='feedback';
  const game=games[index];
  if(correct)scores[index]++;
  status.textContent=expired?'Time’s up':correct?'Correct':'Missed';
  if(expired)frame.contentWindow.postMessage('rush-timeout',location.origin);
  // Disable further input while leaving the answer visible.
  frame.inert=true;
  status.focus({preventScroll:true});
  const continues=correct&&round<game.seconds.length;
  timer=setTimeout(()=>continues?openRound(index,round+1):openRound(index+1),
    correct?800:game.path==='/trainrot/'?4200:2600);
}

function showRecap(){
  phase='recap';
  frame=null;
  panel.replaceChildren();
  panel.hidden=true;
  actions.hidden=true;
  $('#feed-recap').hidden=false;
  const sum=scores.reduce((total,score)=>total+score,0);
  const best=Math.max(...scores);
  const bestGames=games.filter((_,i)=>scores[i]===best).map(game=>game.label);
  $('#rush-score').textContent=`${sum} correct${best?` · Best run: ${best} in ${bestGames.join(', ')}`:''}`;
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

window.addEventListener('message',event=>{
  if(!frame||event.origin!==location.origin||event.source!==frame.contentWindow)return;
  const {type,phase:reported,correct}=event.data??{};
  if(type!=='rush-game')return;
  if(phase==='loading'&&reported==='ready')startClock();
  if(phase==='loading'&&reported==='error')showError();
  if(phase==='playing'&&reported==='answered'&&typeof correct==='boolean'){
    const expired=performance.now()>=deadline;
    finishRound(correct&&!expired,expired);
  }
});

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
