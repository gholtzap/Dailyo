export const dailyDate=()=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date());

export const inFeed=window.parent!==window&&new URLSearchParams(location.search).get('feed')==='1';
if(inFeed)document.documentElement.dataset.dailyFeed='';

export function reportDaily(phase,result,date=dailyDate()){
  if(inFeed)window.parent.postMessage({type:'daily-game',date,phase,result},location.origin);
}
