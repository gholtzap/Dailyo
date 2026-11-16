import {dailyDate} from './bridge.js';

const games=[
  {id:'train',label:'trainrot',path:'/trainrot/'},
  {id:'flags',label:'flagrot',path:'/flags/'},
  {id:'languages',label:'langrot',path:'/languages/'},
  {id:'vocabulary',label:'Vocabulary',path:'/vocabulary/'},
  {id:'maprot',label:'maprot',path:'/maprot/'},
  {id:'yearrot',label:'yearrot',path:'/yearrot/'},
  {id:'borderrot',label:'borderrot',path:'/borderrot/'},
  {id:'ladderrot',label:'ladderrot',path:'/ladderrot/'},
  {id:'cluerot',label:'cluerot',path:'/cluerot/'},
  {id:'scalerot',label:'scalerot',path:'/scalerot/'},
  {id:'swaprot',label:'swaprot',path:'/swaprot/'},
];
const $=selector=>document.querySelector(selector);
const gamePanel=$('#feed-game'),recap=$('#feed-recap'),progress=$('#feed-progress');
const actions=$('.feed-actions'),skip=$('#feed-skip'),retry=$('#feed-retry');
const continueArea=$('#feed-continue'),next=$('#feed-next'),replay=$('#feed-replay');
let day=dailyDate(),skipped=readSkips(),results=new Map();
let index=-1,phase='loading',frame,timeout,focusOnReady=false;

function skipKey(){return `dailyo:daily-feed:skipped:${day}`;}
function readSkips(){
  try{
    const ids=JSON.parse(localStorage.getItem(skipKey()));
    return new Set(Array.isArray(ids)?ids.filter(id=>games.some(game=>game.id===id)):[]);
  }catch{return new Set();}
}
function saveSkips(){try{localStorage.setItem(skipKey(),JSON.stringify([...skipped]));}catch{}}
function renderActions(){
  actions.hidden=!['playing','complete','error'].includes(phase);
  skip.hidden=phase==='complete';
  retry.hidden=phase!=='error';
  continueArea.hidden=phase!=='complete';
  next.textContent=index===games.length-1?'See recap':'Next game';
}
function message(text,role='status'){
  const p=document.createElement('p');
  p.setAttribute('role',role);
  p.textContent=text;
  gamePanel.replaceChildren(p);
}
function showGame(position){
  clearTimeout(timeout);
  index=position;
  phase='loading';
  renderActions();
  const game=games[index];
  recap.hidden=Boolean(game);
  gamePanel.hidden=!game;
  if(!game){
    phase='recap';
    frame=null;
    gamePanel.replaceChildren();
    progress.textContent='';
    const rows=games.map(({id,label})=>{
      const li=document.createElement('li');
      const name=document.createElement('span'),status=document.createElement('span');
      name.textContent=label;
      status.textContent=results.get(id)??'Skipped';
      li.append(name,status);
      return li;
    });
    $('#feed-results').replaceChildren(...rows);
    replay.hidden=games.every(({id})=>results.has(id));
    if(focusOnReady)recap.querySelector('h2').focus();
    focusOnReady=false;
    return;
  }
  progress.textContent=`Game ${index+1} of ${games.length}`;
  message(`Loading ${game.label}…`);
  frame=document.createElement('iframe');
  frame.title=game.label;
  frame.src=`${game.path}?feed=1`;
  frame.classList.add('feed-loading');
  gamePanel.append(frame);
  timeout=setTimeout(showError,12000);
}
function showError(){
  clearTimeout(timeout);
  if(phase==='loading'&&skipped.has(games[index].id)){showGame(index+1);return;}
  phase='error';
  frame=null;
  message(`${games[index].label} didn’t load.`,'alert');
  renderActions();
  if(focusOnReady)retry.focus();
  focusOnReady=false;
}
function changeDay(){
  const today=dailyDate();
  if(today===day)return false;
  day=today;
  skipped=readSkips();
  results=new Map();
  showGame(0);
  return true;
}
window.addEventListener('message',event=>{
  if(!frame||event.origin!==location.origin||event.source!==frame.contentWindow)return;
  const {type,date,phase:reported,result}=event.data??{};
  if(type!=='daily-game'||changeDay()||date!==day)return;
  if(reported==='error'){showError();return;}
  if(!['playing','complete'].includes(reported))return;
  const game=games[index];
  if(reported==='complete')results.set(game.id,typeof result==='string'?result:'Played');
  else results.delete(game.id);
  if(phase==='loading'){
    if(reported==='complete'||skipped.has(game.id)){showGame(index+1);return;}
    clearTimeout(timeout);
    frame.classList.remove('feed-loading');
    gamePanel.querySelector('p').remove();
    if(focusOnReady)progress.focus();
    focusOnReady=false;
  }
  phase=reported;
  renderActions();
});
skip.onclick=()=>{
  if(changeDay()||!['playing','error'].includes(phase))return;
  skipped.add(games[index].id);
  saveSkips();
  focusOnReady=true;
  showGame(index+1);
};
retry.onclick=()=>{
  if(changeDay()||phase!=='error')return;
  focusOnReady=true;
  showGame(index);
};
next.onclick=()=>{
  if(changeDay()||phase!=='complete')return;
  focusOnReady=true;
  showGame(index+1);
};
replay.onclick=()=>{
  if(changeDay()||phase!=='recap')return;
  skipped.clear();
  saveSkips();
  focusOnReady=true;
  showGame(0);
};

let touchStart;
continueArea.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'&&event.isPrimary)touchStart={id:event.pointerId,x:event.clientX,y:event.clientY};
});
continueArea.addEventListener('pointerup',event=>{
  if(touchStart?.id!==event.pointerId)return;
  const up=touchStart.y-event.clientY,horizontal=Math.abs(touchStart.x-event.clientX);
  touchStart=null;
  if(up>48&&up>horizontal*1.5)next.click();
});
continueArea.addEventListener('pointercancel',()=>{touchStart=null;});
window.addEventListener('pageshow',changeDay);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)changeDay();});
setInterval(changeDay,30000);
showGame(0);
