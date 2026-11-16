import {dailyDate} from './puzzles.js';

export {dailyDate};

export const inFeed=window.parent!==window&&new URLSearchParams(location.search).get('feed')==='1';
if(inFeed)document.documentElement.dataset.dailyFeed='';

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
  if(inFeed)window.parent.postMessage({type:'daily-game',date,phase,result},location.origin);
}
