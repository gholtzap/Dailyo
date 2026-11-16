import {dailyDate} from './puzzles.js';

export {dailyDate};

const params=new URLSearchParams(location.search);
const round=params.get('rush');
export const rushRound=window.parent!==window&&/^[0-2]$/.test(round)?Number(round):null;
export const inFeed=window.parent!==window&&(params.get('feed')==='1'||rushRound!==null);
export const startPractice=!inFeed&&params.get('practice')==='1';
if(inFeed)document.documentElement.dataset.dailyFeed='';
if(rushRound!==null)document.documentElement.dataset.rush='';

// Upcoming games can load data before they read or change the player's session.
export function waitForFeedActivation(){
  if(!inFeed||!window.frameElement?.hasAttribute('data-feed-preload'))return;
  return new Promise(resolve=>{
    function activate(event){
      if(event.source!==window.parent||event.origin!==location.origin||event.data!=='daily-game-activate')return;
      window.removeEventListener('message',activate);
      resolve();
    }
    window.addEventListener('message',activate);
  });
}

export function reportDaily(phase,result,date=dailyDate()){
  if(inFeed&&rushRound===null)window.parent.postMessage({type:'daily-game',date,phase,result},location.origin);
}

export function reportRush(phase,correct){
  if(rushRound!==null)window.parent.postMessage({type:'rush-game',phase,correct},location.origin);
}

export function onRushTimeout(reveal){
  window.addEventListener('message',event=>{
    if(event.origin===location.origin&&event.source===window.parent&&event.data==='rush-timeout')reveal();
  });
}
