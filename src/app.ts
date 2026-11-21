import {configureWorld,describeWorldNetwork} from './world.js';
import {required, recordValue} from './dom.js';
import type {Network, Boroughs, Challenge, TrainState, DraftLeg, Ride, Walk, Mode} from './types.js';
interface TrainSave {seed: string; position: number; difficulty: Challenge['difficulty']; challenge: Pick<Challenge, 'from' | 'to'>; deck?: Pick<Challenge, 'from' | 'to'>[]; recent?: Pick<Challenge, 'from' | 'to'>[]; state: TrainState}
interface LegacyTrainSave {round: number; seed: string; pendingTrain: string; state: TrainState}
import './games/help.js';
import {createRouter,transition,formatTime,MAX_GUESSES} from './router.js';
import {createMap} from './map.js';
import {createRewards} from './rewards.js';
import {dailyDate as dateToday,inFeed,reportDaily,rushRound,reportRush,onRushTimeout,startPractice,rushSeed,readRushDraft,saveRushDraft} from './daily/bridge.js';
import {dailyChallenge,seededDeck,trainPuzzle,worldDailyChallenge} from './daily/puzzles.js';
import {showRank} from './daily/rank.js';

const $=required;
const escape=(value: string | number | undefined)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const planner=$('.planner');

async function start(){
  const world=await configureWorld();
  const citySlug=world?.city.slug??'';
  const modeKey=world?`trainrot-world-mode:${citySlug}`:'trainrot-game-mode-v2';
  const dataRoot=world&&citySlug!=='nyc'?`/world-data/${citySlug}/`:'/data/';
  async function loadData<T>(name: string): Promise<T> {
    const response=await fetch(`${dataRoot}${name}.json`);
    if(!response.ok)throw new Error(`Could not load ${name}`);
    return response.json() as Promise<T>;
  }
  const [network,boroughs,challenges]=await Promise.all([loadData<Network>('network'),loadData<Boroughs>('boroughs'),loadData<Challenge[]>('challenges')]);
  if(world){network.metadata.city=world.city;if(citySlug==='nyc')network.metadata.feedVersion='world-nyc:'+network.metadata.feedVersion;describeWorldNetwork(world,network);}
  const mapName=network.metadata.mapName;
  if(mapName&&!world){
    const label=$('.demo-map-label');
    label.textContent=`${mapName} · Fictional network`;
    label.hidden=false;
  }
  const router=createRouter(network),map=createMap($('#city-map'),boroughs,network);
  const allowMapHint=Boolean(network.metadata.mapName)||Boolean(world&&citySlug!=='nyc');
  const rewards=createRewards(planner,$('#city-map'));
  const storageKey=`${world?'trainrot-world-practice':'trainrot-endless-v1'}:${network.metadata.feedVersion}`;
  const nycRouteOrder=['1','2','3','4','5','6','6X','7','7X','A','C','E','B','D','F','M','G','J','L','N','Q','R','W','GS','FS','H'];
  const routeOrder=world&&citySlug!=='nyc'?Object.keys(network.routes).sort((a,b)=>network.routes[a].name.localeCompare(network.routes[b].name,undefined,{numeric:true})):nycRouteOrder;
  const routeTitle=(id: string)=>world&&citySlug!=='nyc'?(network.routes[id].title??network.routes[id].name):(recordValue({'GS':'42 St shuttle','FS':'Franklin shuttle','H':'Rockaway shuttle','6X':'6 express','7X':'7 express'},id)??id);
  const routeSymbol=(id: string)=>world&&citySlug!=='nyc'?network.routes[id].name:(recordValue({'GS':'S','FS':'S','H':'S','6X':'6','7X':'7'},id)??id);
  const badgeColor=(id: string)=>{const hex=network.routes[id].color;const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#000000':'#ffffff';};
  const shuttleSuffix: Record<string, string | undefined>={GS:'42',FS:'F',H:'R'};
  const badge=(id: string)=>`<span class="train-badge${id.endsWith('X')?' express':''}${shuttleSuffix[id]?' shuttle-badge':''}" style="--route-color:#${network.routes[id].color};color:${badgeColor(id)}" role="img" aria-label="${escape(routeTitle(id))} train">${shuttleSuffix[id]?`<span class="shuttle-symbol">S</span><span class="shuttle-suffix">${shuttleSuffix[id]}</span>`:escape(routeSymbol(id))}</span>`;
  const newSeed=()=>`endless:${Date.now()}:${Math.random()}`;
  const difficulties=['easy','medium','hard'];
  let difficulty: Challenge['difficulty']='easy';
  const pool=()=>{const matches=challenges.filter(c=>c.difficulty===difficulty);return matches.length?matches:challenges;};
  let seed=newSeed(),deck=seededDeck(seed,pool()),position=0,state: TrainState={phase:'planning',challenge:deck[0],legs:[]};
  let recent=[{from:state.challenge.from,to:state.challenge.to}];
  const pair=(c: Pick<Challenge, 'from' | 'to'>)=>({from:c.from,to:c.to});
  let mode: Mode | 'rush'='practice',dailyDate='';
  const dailyKey=(date: string)=>`${world?'trainrot-world-daily':'trainrot-daily-v2'}:${network.metadata.feedVersion}:${date}`;
  const storedState=()=>({phase:state.phase,legs:state.legs,guesses:state.guesses??[],assisted:!!state.assisted,skipped:!!state.skipped});
  function save(){
    if(rushRound!==null)return;
    try{if(mode==='daily')localStorage.setItem(dailyKey(dailyDate),JSON.stringify(storedState()));
    else localStorage.setItem(storageKey,JSON.stringify({seed,position,difficulty,challenge:pair(state.challenge),deck:deck.map(pair),recent,state:storedState()}));}catch{}
  }
  function load(){
    const validLegs=(legs: DraftLeg[])=>Array.isArray(legs)&&legs.length<=6&&legs.every(l=>l&&network.routes[l.route]&&(l.to===undefined||network.stations[l.to]));
    const validState=(s: TrainState)=>s&&['planning','revealed'].includes(s.phase)&&validLegs(s.legs)&&(s.guesses===undefined||Array.isArray(s.guesses)&&s.guesses.length<=MAX_GUESSES&&s.guesses.every(g=>validLegs(g)&&g.length>0))&&!(s.phase==='planning'&&(s.guesses?.length??0)>=MAX_GUESSES);
    try{
      // Import existing progress once; future saves use the trainrot key.
      const saved=JSON.parse(localStorage.getItem(storageKey)??localStorage.getItem(`last-stop-endless-v1:${network.metadata.feedVersion}`)??'null') as TrainSave | null;
      if(saved){
        if(typeof saved.seed!=='string'||!saved.seed.startsWith('endless:')||saved.seed.length>100||!Number.isInteger(saved.position)||saved.position<0||!validState(saved.state))return;
        seed=saved.seed;difficulty=difficulties.includes(saved.difficulty)?saved.difficulty:'easy';
        const oldChallenge=saved.challenge?[...challenges,...(network.retiredChallenges??[])].find(c=>c.from===saved.challenge.from&&c.to===saved.challenge.to):seededDeck(seed,challenges)[saved.position];
        if(!oldChallenge)return;
        deck=seededDeck(seed,pool());
        if(Array.isArray(saved.deck)&&saved.deck.length<=deck.length){
          const byPair=new Map(deck.map(c=>[`${c.from}:${c.to}`,c]));
          const restored=saved.deck.map(p=>byPair.get(`${p?.from}:${p?.to}`));
          if(restored.every((c): c is Challenge => Boolean(c))&&new Set(restored).size===restored.length){
            const used=new Set(restored);deck=[...restored,...deck.filter(c=>!used.has(c))];
          }
        }
        position=deck.findIndex(c=>c.from===oldChallenge.from&&c.to===oldChallenge.to);
        if(position<0){deck=[oldChallenge,...deck];position=0;}
        state={...saved.state,challenge:oldChallenge};
        if(Array.isArray(saved.recent))recent=saved.recent.filter(p=>p&&network.stations[p.from]&&network.stations[p.to]).slice(-4).map(pair);
        if(!recent.length||recent.at(-1)!.from!==oldChallenge.from||recent.at(-1)!.to!==oldChallenge.to)recent=[pair(oldChallenge)];
      }else{
        // Bring an unfinished journey from the previous Daily/Practice game along.
        const feed=network.metadata.feedVersion,mode=localStorage.getItem(`last-stop-mode-v1:${feed}`)==='practice'?'practice':'daily';
        const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const old=JSON.parse(localStorage.getItem(mode==='practice'?`last-stop-practice-v1:${feed}`:`last-stop-v1:${feed}:${date}`)??'null') as LegacyTrainSave | null;
        if(!old||!Number.isInteger(old.round)||old.round<0||old.round>4||!validState(old.state))return;
        if(mode==='practice'&&(typeof old.seed!=='string'||!old.seed.startsWith('practice:')||old.seed.length>100))return;
        const shuffled=seededDeck(mode==='practice'?old.seed:date,challenges),legacy=[],used=new Set();
        for(const c of shuffled){if(used.has(c.from)||used.has(c.to))continue;legacy.push(c);used.add(c.from);used.add(c.to);if(legacy.length===5)break;}
        const c=(legacy.length===5?legacy:shuffled.slice(0,5))[old.round];
        position=deck.findIndex(item=>item.from===c.from&&item.to===c.to);if(position<0){deck=[c,...deck];position=0;}
        state={...old.state,challenge:deck[position]};recent=[pair(state.challenge)];
        if(state.phase==='planning'&&routeOrder.includes(old.pendingTrain)&&state.legs.length<6)state.legs=[...state.legs,{route:old.pendingTrain}];
      }
      if(state.phase==='planning'){
        state.legs=state.legs.map(({route})=>({route}));state.guesses=(state.guesses??[]).map(g=>g.map(({route})=>({route})));
      }else state.result=router.grade(state.challenge.from,state.challenge.to,state.guesses??[],state.skipped?[]:state.legs);
    }catch{}
  }
  if(rushRound===null)load();
  const difficultyControl=$('#difficulty');difficultyControl.value=difficulty;
  let practice: {seed: string; deck: Challenge[]; position: number; state: TrainState; difficulty: Challenge['difficulty']; recent: Pick<Challenge, 'from' | 'to'>[]}={seed,deck,position,state,difficulty,recent};
  function openDaily(){
    dailyDate=dateToday();const challenge=world?worldDailyChallenge(challenges,dailyDate,citySlug):dailyChallenge(challenges,dailyDate);let saved: Omit<TrainState, 'challenge'> | null = null;
    try{saved=JSON.parse(localStorage.getItem(dailyKey(dailyDate))??'null') as Omit<TrainState, 'challenge'> | null;}catch{}
    const validLegs=(legs: DraftLeg[])=>Array.isArray(legs)&&legs.length<=6&&legs.every(l=>l&&network.routes[l.route]);
    if(!saved||!['planning','revealed'].includes(saved.phase)||!validLegs(saved.legs)||!Array.isArray(saved.guesses)||saved.guesses.length>MAX_GUESSES||!saved.guesses.every(validLegs))saved={phase:'planning',legs:[],guesses:[]};
    state={...saved,challenge};
    if(state.phase==='revealed')state.result=router.grade(challenge.from,challenge.to,state.guesses??[],state.skipped?[]:state.legs);
  }
  function selectMode(next: Mode){
    if(next===mode)return;
    if(mode==='practice')practice={seed,deck,position,state,difficulty,recent};
    mode=next;try{localStorage.setItem(modeKey,mode);}catch{}
    if(mode==='daily')openDaily();
    else{
      ({seed,deck,position,state,difficulty,recent}=practice);
      try{if(!localStorage.getItem(storageKey))save();}catch{}
    }
    difficultyControl.value=difficulty;difficultyControl.closest('label')!.hidden=mode==='daily';
    $('#daily-mode').setAttribute('aria-pressed',String(mode==='daily'));$('#practice-mode').setAttribute('aria-pressed',String(mode==='practice'));
    draw();
  }
  $('#daily-mode').onclick=()=>selectMode('daily');$('#practice-mode').onclick=()=>selectMode('practice');
  difficultyControl.onchange=()=>{
    difficulty=difficultyControl.value as Challenge['difficulty'];seed=newSeed();deck=seededDeck(seed,pool());position=0;
    const first=deck.findIndex(c=>!recent.some(p=>p.from===c.to&&p.to===c.from));
    if(first>0)[deck[0],deck[first]]=[deck[first],deck[0]];
    state={phase:'planning',challenge:deck[0],legs:[]};recent=[...recent,pair(state.challenge)].slice(-4);save();draw();
  };
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='daily'&&dailyDate!==dateToday()){openDaily();draw();}});
  function ticket(c: Challenge,body=''){return `<div class="journey-ticket"><div class="journey-endpoints"><div class="endpoint"><span class="endpoint-badge">A</span><div><strong>${escape(c.fromTitle)}</strong></div></div><div class="endpoint"><span class="endpoint-badge">B</span><div><strong>${escape(c.toTitle)}</strong></div></div></div>${body}</div>`;}
  const usedRoutes=routeOrder.filter(id=>network.patterns.some(p=>p.route===id));
  function trainButton(id: string){
    const symbol=shuttleSuffix[id]?'S'+shuttleSuffix[id]:routeSymbol(id);
    const actionName=world?symbol:`Add ${symbol}${shuttleSuffix[id]?' '+routeTitle(id):id.endsWith('X')?' express':''} train`;
    const content=world?badge(id).replace('role="img"','').replace(/ aria-label="[^"]*"/,''):badge(id).replace('role="img"','aria-hidden="true"');
    return `<button type="button" ${world?`aria-description="Add ${escape(routeTitle(id))} train"`:`aria-label="${escape(actionName)}"`} title="${escape(world?routeTitle(id):shuttleSuffix[id]?routeTitle(id):routeSymbol(id))}" tabindex="${id===usedRoutes[0]?0:-1}" class="train-choice" data-route="${id}" ${state.legs.length>=6?'disabled':''}>${content}${world&&citySlug!=='nyc'&&routeTitle(id)!==symbol?`<span class="train-line-name">${escape(routeTitle(id))}</span>`:''}</button>`;
  }
  const same=(a: object | undefined,b: object)=>JSON.stringify(a)===JSON.stringify(b);
  function guessFeedback(){
    const guess=state.guesses?.at(-1);
    if(!guess||!same(guess,state.legs))return '';
    const result=router.assess(state.challenge.from,state.challenge.to,guess);
    const last=result.legs.at(-1);
    const message=result.brokenLeg!==undefined?result.error:last?`${routeSymbol(last.route)} to ${network.stations[last.to].label}. What next?`:'Add another train.';
    return `<div class="route-feedback" id="guess-feedback-title" tabindex="-1" role="status"><p>${escape(message)}</p>${state.assisted?'':`<span class="partial-score">${result.score} points so far</span>`}</div>`;
  }
  function mapTools(planning: boolean){
    $('#map-caption').hidden=planning;
    $('#map-caption').textContent=planning?'':'Your route';
    $('.map-caption').hidden=planning;
  }
  function recordResult(){
    save();draw();focusHeading();
  }
  let lineFilter='';
  function drawPlanning(){
    rewards.reset();rewards.decorate({valid:false});
    const c=state.challenge,full=state.legs.length>=6;
    mapTools(true);
    planner.innerHTML=`
      ${rushRound!==null?'<h2 id="rush-journey" tabindex="-1">Find the fastest route</h2>':''}
      ${ticket(c)}
      ${world&&usedRoutes.length>14?`<label class="world-line-search">Find a line<input id="line-search" type="search" value="${escape(lineFilter)}" placeholder="Line name or number" autocomplete="off"></label>`:''}<div class="train-picker" role="group" aria-label="Add a train"><div class="train-grid">${usedRoutes.map(trainButton).join('')}</div></div>
      ${full?'<p class="ready-note">Six trains maximum. Check your route or undo a train.</p>':''}
      <div class="route-editor"><div class="journey-route"><div class="sequence-row">${state.legs.length?`<ol class="train-sequence" aria-label="Your train sequence">${state.legs.map(l=>`<li>${badge(l.route)}</li>`).join('')}</ol>`:'<p class="route-empty">Tap your trains in order.</p>'}${state.legs.length?'<button id="undo-train" class="quiet-button" aria-label="Undo last train">Undo</button>':''}</div>${guessFeedback()}${state.guesses?.length?`<p class="check-count">${state.guesses.length} of ${MAX_GUESSES} checks</p>`:''}</div>
      <div class="route-actions"><button id="reveal" class="primary-button" ${state.legs.length&&!same(state.guesses?.at(-1),state.legs)?'':'disabled'}>Check route</button></div></div>
      <div class="help-actions">${mode==='practice'?'<button id="skip" class="hint-button">Skip</button>':''}<button id="show-answer" class="hint-button">Show answer</button></div>
      ${state.assisted||!allowMapHint?'':`<details class="map-hint"><summary>Map hint</summary><p>Showing the map makes this journey unscored.</p><button id="hint" type="button" class="secondary-button">${world?'Show rail map':'Show subway map'}</button></details>`}`;
    const filterInput=document.querySelector<HTMLInputElement>('#line-search');
    function filterLines(){
      const term=lineFilter.toLocaleLowerCase();let first=true;
      planner.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(button=>{button.hidden=!routeTitle(button.dataset.route!).toLocaleLowerCase().includes(term)&&!routeSymbol(button.dataset.route!).toLocaleLowerCase().includes(term);button.tabIndex=!button.hidden&&first?0:-1;if(!button.hidden)first=false;});
    }
    if(filterInput){filterInput.oninput=()=>{lineFilter=filterInput.value;filterLines();};filterLines();}
    planner.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(button=>{
      button.onclick=()=>{
        const route=button.dataset.route!;
        state=transition(state,{type:'add',leg:{route}},router);save();drawPlanning();
        const next=planner.querySelector<HTMLButtonElement>(`[data-route="${route}"]`)!;
        if(!next.disabled){planner.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(b=>b.tabIndex=b===next?0:-1);next.focus({preventScroll:true});}
        else $('#reveal').focus({preventScroll:true});
      };
      button.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
        event.preventDefault();const options=[...planner.querySelectorAll<HTMLButtonElement>('[data-route]')].filter(b=>b.getClientRects().length&&!b.disabled),index=options.indexOf(button);
        const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+options.length)%options.length;
        options.forEach((b,i)=>b.tabIndex=i===next?0:-1);options[next]?.focus();
      };
    });
    if(document.querySelector('#undo-train'))$('#undo-train').onclick=()=>{
      state=transition(state,{type:'remove',index:state.legs.length-1},router);save();drawPlanning();
      (document.querySelector<HTMLElement>('#undo-train')??planner.querySelector<HTMLElement>('[data-route]'))!.focus({preventScroll:true});
    };
    $('#reveal').onclick=()=>{
      if(rushRound!==null){finishRush(true);return;}
      const previous=router.grade(c.from,c.to,state.guesses??[]).score??0;
      const next=transition(state,{type:'submit'},router);if(next===state)return;state=next;
      if(state.phase==='planning'){save();drawPlanning();$('#guess-feedback-title').focus({preventScroll:true});rewards.show({previous,result:router.grade(c.from,c.to,state.guesses??[]),assisted:state.assisted});return;}
      recordResult();rewards.show({previous,result:state.result!,assisted:state.assisted});
    };
    if(document.querySelector('#skip'))$('#skip').onclick=nextJourney;
    $('#show-answer').onclick=()=>{if(rushRound!==null){finishRush(false);return;}state=transition(state,{type:'show-answer'},router);recordResult();};
    if(document.querySelector('#hint'))$('#hint').onclick=()=>{state=transition(state,{type:'hint'},router);save();map.showNetwork();drawPlanning();if(matchMedia('(max-width:700px)').matches)$('.map-panel').scrollIntoView({behavior:'instant',block:'start'});$('#city-map').focus({preventScroll:true});};
    reportDaily('playing',undefined,dailyDate);
  }
  function resultLegs(legs: Ride[]){const walk=(w: Walk)=>`Walk to ${escape(network.stations[w.to].label)} · ${formatTime(w.seconds)}${w.fareControl?' · Exit and re-enter subway (another fare may apply)':''}`;return `<ol class="result-legs">${legs.map(l=>{const p=network.patterns[l.patternIndex],arrival=l.walkAfter?.from??l.to;return `${l.walkBefore?`<li><p>${walk(l.walkBefore)}</p></li>`:''}<li>${badge(l.route)}<p>To ${escape(network.stations[arrival].label)}<small>${escape(routeSymbol(l.route))} toward ${escape(p.headsign)} · ${l.stops} ${l.stops===1?'stop':'stops'}</small></p></li>${l.walkAfter?`<li><p>${walk(l.walkAfter)}</p></li>`:''}`;}).join('')}</ol>`;}
  function finishRush(submitted: boolean){
    if(state.phase!=='planning')return;
    const c=state.challenge;
    const answer=transition(state,{type:'show-answer'},router);
    const result=submitted?router.evaluate(c.from,c.to,state.legs):null;
    const correct=result?.valid===true&&result.seconds===answer.result!.optimal?.seconds;
    state=answer;
    const shown=correct&&result?{...answer.result!,...result}:answer.result!;
    map.reveal(shown);
    map.filter(correct?'yours':'best');
    planner.innerHTML=`<h2>${correct?'Correct · Your route':'Fastest route'}</h2>${ticket(c)}${resultLegs(correct&&result?result.legs:answer.result!.optimal?.legs??[])}`;
    planner.scrollIntoView({block:'nearest'});
    reportRush('answered',correct);
  }
  function drawResult(displayed=state){
    rewards.reset();
    const r=displayed.result!,c=displayed.challenge;
    displayed={...displayed,legs:r.draft??displayed.legs};
    mapTools(false);
    rewards.decorate(displayed.skipped?{valid:false}:{...r,assisted:displayed.assisted});
    map.filter(displayed.skipped?'best':'yours');
    if(displayed.skipped)$('#map-caption').textContent='Fastest route';
    const rideKey=(legs: Ride[])=>legs.map(({route,from,to})=>({route,from,to}));
    const tied=r.valid&&r.optimal&&r.seconds===r.optimal.seconds&&!same(rideKey(r.legs),rideKey(r.optimal.legs));
    const subtitle=tied?'Your route ties the fastest time. The alternative below takes the same time.':displayed.assisted?'':r.valid?r.score===100?'':formatTime((r.seconds??0)-(r.optimal?.seconds??0))+' slower':displayed.skipped?'':r.error??'Add another train to reach the destination.';
    const canResume=!r.valid&&!displayed.skipped&&!displayed.guesses?.length&&displayed.legs.length;
    const nextAction=mode==='daily'?'<button id="start-practice" class="primary-button">Play practice</button>':'<button id="next" class="primary-button next-action">Next</button>';
    const sequence=displayed.legs.length?`<ol class="train-sequence result-sequence" aria-label="Your train sequence">${displayed.legs.map(l=>`<li>${badge(l.route)}</li>`).join('')}</ol>`:'';
    const score=displayed.assisted?(r.valid?'Completed with map':'Map used · Unscored'):`${r.score??0}<small> points</small>`;
    const status=displayed.guesses?.length===MAX_GUESSES?'Out of guesses.':'Partial route.';
    const resultTitle=displayed.skipped?'<h1>Answer shown</h1>':r.valid?`<h1 class="result-score">${score}</h1>`:`<h1>${status}</h1><div class="result-score">${score}</div>`;
    const verdict=displayed.skipped?'':displayed.assisted?'':r.valid?(r.seconds===r.optimal?.seconds?(tied?'Tied fastest route':'Fastest route'):'Route completed'):'';
    const copyControl=mode==='daily'?'<span class="copy-control"><button id="copy-results" class="copy-icon" type="button" aria-label="Copy results" >Copy results</button></span>':'';
    planner.innerHTML=`<div class="result-heading">${resultTitle}${copyControl}</div>
      ${verdict?`<p class="result-verdict">${verdict}</p>`:''}
      ${subtitle?`<p class="result-subtitle">${escape(subtitle)}</p>`:''}
      ${copyControl?'<p id="copy-status" class="share-status" role="status"></p>':''}
      ${ticket(c,displayed.skipped?'':sequence)}
      <div class="result-route primary-itinerary"><h3>${displayed.skipped?'Fastest route':'Your route'}${displayed.skipped?r.optimal?` · ${formatTime(r.optimal.seconds)}`:'':r.valid?` · ${formatTime(r.seconds??0)}`:' · Incomplete'}</h3>${resultLegs(displayed.skipped?r.optimal?.legs??[]:r.legs)}</div>
      ${displayed.skipped?'':`<div class="compare-controls" role="group" aria-label="Show routes on map"><button data-view="yours" class="active" aria-pressed="true">Your route</button><button data-view="best" aria-pressed="false">Fastest route</button><button data-view="compare" aria-pressed="false">Compare</button></div>`}
      <button id="view-route-map" class="secondary-button mobile-only">View routes on map</button>
      ${nextAction}${canResume?'<button id="resume-guessing" class="secondary-button resume-guessing">Keep guessing</button>':''}
      ${displayed.skipped?'':`<details class="route-details"><summary>${tied?'Another fastest route':'Route details'}</summary>
        <div class="comparison"><div class="comparison-row"><span>Your route</span><span>${displayed.skipped?'Not submitted':r.valid?formatTime(r.seconds??0):'Incomplete'}</span></div><div class="comparison-row"><span>Fastest route</span><span>${r.optimal?formatTime(r.optimal.seconds):'Unavailable'}</span></div></div>
        <div class="result-route alternative-itinerary"><h3>${tied?'Another fastest route':'Fastest route'}${r.optimal?` · ${formatTime(r.optimal.seconds)}`:''}</h3>${resultLegs(r.optimal?.legs??[])}</div>
        ${!displayed.assisted&&r.points?.length?`<div class="ride-points"><h3>Points by train</h3><ol>${r.points.map(p=>`<li>${badge(p.route)}<span>${p.points} points</span></li>`).join('')}</ol></div>`:''}
      </details>`}`;
    $('#view-route-map').onclick=()=>{$('.map-panel').scrollIntoView({block:'start',behavior:'instant'});$('#city-map').focus({preventScroll:true});};
    planner.querySelectorAll<HTMLElement>('[data-view]').forEach(button=>button.onclick=()=>{map.filter(button.dataset.view!);$('#map-caption').textContent=button.dataset.view==='compare'?'Your route solid · Fastest route dashed':button.dataset.view==='best'?'Fastest route':'Your route';planner.querySelectorAll<HTMLElement>('[data-view]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});});
    if(document.querySelector('#resume-guessing'))$('#resume-guessing').onclick=()=>{
      const next=transition(state,{type:'retry'},router);if(next===state)return;
      state={...next,legs:state.legs.map(({route})=>({route})),guesses:(next.guesses??[]).map(g=>g.map(({route})=>({route})))};save();draw();focusHeading();
    };
    if(mode==='daily'){
      $('#start-practice').onclick=()=>selectMode('practice');
      $('#copy-results').onclick=async()=>{
        const outcome=displayed.skipped?'Answer shown':displayed.assisted?'Map used':`${r.score??0} points`;
        const history=(displayed.guesses??[]).map(guess=>{
          const assessment=router.assess(c.from,c.to,guess);
          return assessment.valid?'🟩':assessment.brokenLeg!==undefined?'⬛':'🟨';
        }).join('');
        const text=`${world?'trainrot world · '+world.city.name:'trainrot'} ${dailyDate}\n${outcome} · ${displayed.guesses?.length??0}/${MAX_GUESSES} checks${history?`\n${history}`:''}\n${world?`https://trainrot.vercel.app/trainrot-world/${citySlug}/`:'https://trainrot.vercel.app/trainrot/'}`;
        try{await navigator.clipboard.writeText(text);$('#copy-status').textContent='Copied';}
        catch{planner.querySelector('.share-fallback')?.remove();const status=$('#copy-status');status.textContent='Select and copy your results:';const field=document.createElement('textarea');field.className='share-fallback';field.setAttribute('aria-label','Results to copy');field.value=text;status.after(field);field.focus();field.select();}
      };
    }else $('#next').onclick=nextJourney;
    if(mode==='daily'&&!displayed.skipped&&!displayed.assisted&&displayed.guesses?.length){
      const rank=document.createElement('div');
      rank.className='daily-rank';
      $('.result-heading').after(rank);
      showRank(rank,{game:'train',day:dailyDate,puzzle:trainPuzzle(network,c),answers:displayed.guesses},r.score);
    }
    reportDaily('complete',displayed.skipped?'Answer shown':displayed.assisted?'Map used':`${r.score??0} points`,dailyDate);
  }
  function nextJourney(){
      if(mode!=='practice')return;
      let next=position+1;
      if(next>=deck.length){seed=newSeed();deck=seededDeck(seed,pool());next=0;}
      const allowed=(c: Challenge)=>!recent.some(p=>p.from===c.to&&p.to===c.from)&&!(c.from===state.challenge.from&&c.to===state.challenge.to);
      let chosen=deck.findIndex((c,i)=>i>=next&&allowed(c));
      // Carry deferred journeys into the next bag when only recent reverses remain.
      if(chosen<0&&deck.length>recent.length){
        const deferred=deck.slice(next),keys=new Set(deferred.map(c=>`${c.from}:${c.to}`));
        const reverseKeys=new Set(deferred.map(c=>`${c.to}:${c.from}`));
        seed=newSeed();const fresh=seededDeck(seed,pool()).filter(c=>!keys.has(`${c.from}:${c.to}`));
        deck=[...fresh.filter(c=>!reverseKeys.has(`${c.from}:${c.to}`)),...deferred,...fresh.filter(c=>reverseKeys.has(`${c.from}:${c.to}`))];next=0;
        chosen=deck.findIndex(allowed);
      }
      // A pool smaller than the separation window may have no alternative.
      if(chosen<0)chosen=deck.findIndex((c,i)=>i>=next&&!(c.from===state.challenge.from&&c.to===state.challenge.to));
      if(chosen<0)chosen=next;
      [deck[next],deck[chosen]]=[deck[chosen],deck[next]];
      state=transition(state,{type:'next',challenge:deck[next]},router);position=next;
      recent=[...recent,pair(state.challenge)].slice(-4);save();draw();focusHeading();
  }
  function focusHeading(){const h=planner.querySelector('h1')??planner.querySelector<HTMLElement>('.journey-ticket')!;h.tabIndex=-1;h.focus({preventScroll:true});if(matchMedia('(max-width:700px)').matches)planner.scrollIntoView({behavior:'instant',block:'start'});else window.scrollTo({top:0,behavior:'instant'});}
  function draw(){
    map.setChallenge(state.challenge);map.filter('compare');
    if(state.phase==='planning'){
      if(state.assisted&&rushRound===null)map.showNetwork();drawPlanning();
    }else{map.reveal(state.result!);drawResult();}
  }
  let initialMode;try{initialMode=localStorage.getItem(modeKey);}catch{}
  if(rushRound!==null){
    mode='rush';
    difficultyControl.closest('label')!.hidden=true;
    const easy=challenges.filter(c=>c.difficulty==='easy');
    const rushDeck=seededDeck(rushSeed('train'),easy.length>=3?easy:challenges);
    const challenge=rushDeck[rushRound%rushDeck.length];
    state={phase:'planning',challenge,legs:[],assisted:true};
    const draft=readRushDraft<unknown>();
    if(Array.isArray(draft)&&draft.length<=6&&draft.every(route=>typeof route==='string'&&Object.hasOwn(network.routes,route))){
      for(const route of draft)state=transition(state,{type:'add',leg:{route}},router);
    }
    saveRushDraft(()=>state.legs.map(l=>l.route));
    onRushTimeout(()=>finishRush(false));
    draw();
    reportRush('ready');
  }
  else if(inFeed){mode='daily';openDaily();draw();}
  else if(startPractice||initialMode==='practice'){difficultyControl.closest('label')!.hidden=false;$('#daily-mode').setAttribute('aria-pressed','false');$('#practice-mode').setAttribute('aria-pressed','true');save();draw();}
  else selectMode('daily');
  setInterval(()=>{if(mode==='daily'&&dailyDate!==dateToday()){openDaily();draw();}},30000);
}
start().catch(error=>{
  reportRush('error');reportDaily('error');
  console.error(error);document.querySelector<HTMLElement>('.map-panel')!.hidden=true;document.querySelector('.game-layout')!.classList.add('error-layout');planner.innerHTML='<h1>The network didn’t load.</h1><button id="reload" class="primary-button">Reload game</button>';$('#reload').onclick=()=>location.reload();
});
