import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, transition, formatTime } from '../dist/router.js';

// These risks are hard to establish from a handful of real map journeys:
// asymmetric service, express skips, impossible transfers, and scoring ties.
const data = {
  metadata: { transferSeconds: 240 },
  stations: Object.fromEntries(['a','b','c','d','e'].map(id => [id,{id,name:id}])),
  patterns: [
    {route:'L', stations:['a','b','c','d'],seconds:[90,90,90]},
    {route:'X', stations:['a','c','d'],seconds:[80,80]},
    {route:'Q', stations:['b','e'],seconds:[60]},
    {route:'Z', stations:['a','d'],seconds:[160]},
    {route:'W', stations:['a','d'],seconds:[161]},
  ],
};
test('a journey earns points per ride and continues from the chosen train',()=>{
  const router=createRouter(data),partial=[{route:'L',to:'e'}];
  assert.equal(router.assess('a','e',partial).score,23);
  assert.equal(router.assess('a','e',partial).ceiling,100);
  assert.equal(router.assess('a','e',partial).estimatedSeconds,390);
  assert.equal(router.assess('a','e',[{route:'Q',to:'e'}]).score,1);
  const state={phase:'planning',challenge:{from:'a',to:'e'},legs:[],guesses:[partial]};
  const continued=transition(state,{type:'continue',route:'L'},router);
  assert.deepEqual(continued.legs,[{route:'L',to:'b'}]);
  assert.equal(transition(continued,{type:'continue',route:'L'},router),continued);
  assert.equal(transition(state,{type:'continue',route:'Q'},router),state);
  const finished=transition(state,{type:'show-answer'},router);
  assert.equal(finished.result.score,23);
  assert.deepEqual(finished.legs,[]);
  assert.equal(finished.skipped,true);
  const completed=transition(continued,{type:'submit',draft:[...continued.legs,{route:'Q',to:'e'}]},router);
  assert.deepEqual(completed.result.points.map(p=>p.points),[23,77]);
  assert.equal(router.grade('a','e',[]).score,0);
  assert.equal(router.grade('a','e',[partial,[{route:'Q',to:'e'}]]).score,1,'Earlier independent guesses cannot override the current journey');
  const restored=transition({...state,guesses:[partial,[{route:'Q',to:'e'}]]},{type:'submit',draft:partial},router);
  assert.equal(restored.guesses.length,2,'Restoring an earlier choice does not spend another guess');
  assert.deepEqual(restored.guesses.at(-1),partial);
  assert.equal(router.grade('a','e',restored.guesses).score,23);
});
test('chooses the fast express and accepts an equally fast alternative', () => {
  const router = createRouter(data);
  assert.equal(router.best('a','d').seconds, 160);
  assert.equal(router.evaluate('a','d',[{route:'Z',to:'d'}]).score,100);
  assert.equal(router.evaluate('a','d',[{route:'X',to:'d'}]).score,100);
});
test('tiny partial credit stays positive and its ride points sum to the score',()=>{
  const long={...data,patterns:[{route:'Q',stations:['a','e'],seconds:[10]},{route:'L',stations:['a','b'],seconds:[1]},{route:'X',stations:['b','e'],seconds:[10000]}]};
  const result=createRouter(long).assess('a','e',[{route:'L',to:'e'}]);
  assert.equal(result.score,1);
  assert.equal(result.points.reduce((sum,p)=>sum+p.points,0),1);
});
test('a slightly slower route cannot earn a perfect score', () => {
  const almostTied={...data,patterns:[{route:'Z',stations:['a','d'],seconds:[1000]},{route:'W',stations:['a','d'],seconds:[1001]}]};
  assert.equal(createRouter(almostTied).evaluate('a','d',[{route:'W',to:'d'}]).score,99);
  assert.equal(formatTime(161),'2 min 41 sec');
  assert.equal(formatTime(15),'15 sec');
});
test('show answer reveals the best route and cannot be edited', () => {
  const router=createRouter(data);
  const state={phase:'planning',legs:[],challenge:{from:'a',to:'d'}};
  const skipped=transition(state,{type:'show-answer'},router);
  assert.equal(skipped.phase,'revealed');
  assert.equal(skipped.skipped,true);
  assert.equal(skipped.result.valid,false);
  assert.equal(skipped.result.optimal.seconds,160);
  assert.equal(transition(skipped,{type:'submit'},router),skipped);
});
test('rejects express skips, unreachable direction, and unfinished journeys', () => {
  const router = createRouter(data);
  assert.equal(router.evaluate('a','b',[{route:'X',to:'b'}]).valid,false);
  assert.equal(router.best('d','a'),null);
  assert.equal(router.evaluate('a','d',[{route:'L',to:'b'}]).valid,false);
});
test('charges transfer overhead once per additional boarding', () => {
  const router = createRouter(data);
  const result = router.evaluate('a','e',[{route:'L',to:'b'},{route:'Q',to:'e'}]);
  assert.equal(result.seconds,90+240+60);
  assert.equal(result.score,100);
  assert.equal(result.legs.length,2);
});
test('revealing ends editing and repeated submissions cannot change the result', () => {
  const state = {phase:'planning',legs:[{route:'Z',to:'d'}],challenge:{from:'a',to:'d'}};
  const router = createRouter(data);
  const revealed = transition(state,{type:'submit'},router);
  assert.equal(revealed.phase,'revealed');
  assert.equal(transition(revealed,{type:'add',leg:{route:'L',to:'b'}},router),revealed);
  assert.equal(transition(revealed,{type:'submit'},router),revealed);
});

test('keeps a correct first train as a partial guess without revealing the answer', () => {
  const router=createRouter(data);
  const state={phase:'planning',legs:[],challenge:{from:'a',to:'e'}};
  const guess=[{route:'L',to:'e'}];
  const partial=transition(state,{type:'submit',draft:guess},router);
  assert.equal(partial.phase,'planning');
  assert.deepEqual(partial.legs,[],'The implicit ride to B must not become a committed transfer');
  assert.deepEqual(partial.guesses,[guess]);
  assert.equal(partial.result,undefined);
  assert.equal(router.feedback('a','e',guess).legs[0].status,'transfer');
  assert.equal(transition(partial,{type:'submit',draft:guess},router),partial,'Duplicate guesses are free');
  const continued=transition(partial,{type:'add',leg:{route:'L',to:'b'}},router);
  const finished=transition(continued,{type:'submit',draft:[...continued.legs,{route:'Q',to:'e'}]},router);
  assert.equal(finished.phase,'revealed');
  assert.equal(finished.result.score,100);
  assert.equal(finished.guesses.length,2);
});

test('feedback recognizes alternate fastest prefixes and stops at a broken connection', () => {
  const alternate={...data,patterns:[...data.patterns,{route:'Y',stations:['a','b'],seconds:[90]}]};
  const router=createRouter(alternate);
  assert.equal(router.feedback('a','e',[{route:'Y',to:'b'},{route:'Q',to:'e'}]).legs[0].status,'correct');
  assert.equal(router.feedback('a','e',[{route:'X',to:'b'}]).legs[0].status,'wrong-stop','An express cannot stop at a local station');
  assert.deepEqual(router.feedback('a','e',[{route:'Q',to:'b'},{route:'L',to:'e'}]).legs.map(l=>l.status),['wrong-train','blocked']);
  assert.equal(router.feedback('a','d',[{route:'L',to:'d'}]).legs[0].status,'connected','A slower connected ride is not marked impossible');
});

test('six distinct incomplete guesses end once and survive a map hint', () => {
  const router=createRouter(data);
  let state={phase:'planning',legs:[],challenge:{from:'a',to:'e'}};
  for(let index=0;index<6;index++){
    if(index===2)state=transition(state,{type:'hint'},router);
    const routes=['X','Z','Q','W','L','X'];
    state=transition(state,{type:'submit',draft:[{route:routes[index],to:index===5?'b':'e'}]},router);
    assert.equal(state.guesses.length,index+1);
    assert.equal(state.phase,index===5?'revealed':'planning');
  }
  assert.equal(state.assisted,true);
  assert.equal(state.result.valid,false);
  assert.equal(transition(state,{type:'submit',draft:[{route:'L',to:'e'}]},router),state);
  assert.equal(transition(state,{type:'next',challenge:state.challenge},router).guesses,undefined,'A new journey starts without guesses');
});

test('an older failed result can continue unscored after its answer was exposed', () => {
  const router=createRouter(data),legs=[{route:'L',to:'e'}];
  const state={phase:'revealed',challenge:{from:'a',to:'e'},legs,result:router.evaluate('a','e',legs)};
  const retried=transition(state,{type:'retry'},router);
  assert.equal(retried.phase,'planning');
  assert.equal(retried.assisted,true);
  assert.deepEqual(retried.guesses,[legs]);
  assert.deepEqual(retried.legs,[]);
  assert.equal(retried.result,undefined);
  assert.equal(transition(retried,{type:'retry'},router),retried);
  assert.equal(transition({...state,guesses:Array(6).fill(legs)},{type:'retry'},router).phase,'revealed');
  assert.equal(transition({...state,skipped:true},{type:'retry'},router).phase,'revealed');
});
test('indoor walking works at the start, end, and between rides and changes the score',()=>{
  const network={metadata:{transferSeconds:20},stations:Object.fromEntries(['a','b','c','d','e'].map(id=>[id,{id,name:id}])),walkingConnections:[{from:'a',to:'b',seconds:30,fareControl:true},{from:'c',to:'d',seconds:40}],patterns:[
    {route:'X',stations:['b','c'],seconds:[40]},
    {route:'Y',stations:['a','c'],seconds:[100]},
    {route:'Z',stations:['d','e'],seconds:[50]},
  ]};
  const r=createRouter(network);
  const first=r.assess('a','c',[{route:'X'}]);
  assert.equal(first.valid,true);assert.equal(first.seconds,70);assert.equal(first.score,100);
  assert.equal(first.legs[0].walkBefore.seconds,30);assert.equal(first.legs[0].walkBefore.fareControl,true);
  const slower=r.assess('a','c',[{route:'Y'}]);assert.equal(slower.seconds,100);assert.equal(slower.score,70);
  const last=r.assess('a','d',[{route:'X'}]);assert.equal(last.seconds,110);assert.equal(last.legs[0].walkAfter.seconds,40);
  const transfer=r.assess('a','e',[{route:'X'},{route:'Z'}]);assert.equal(transfer.valid,true);assert.equal(transfer.seconds,180);
  assert.equal(transfer.points.reduce((n,p)=>n+p.points,0),transfer.score);
  assert.equal(r.assess('e','a',[{route:'Z'},{route:'X'}]).valid,false,'walking does not reverse train direction');
  assert.equal(r.assess('a','e',[{route:'Z'}]).valid,false,'unconnected stations cannot be reached on foot');
});

