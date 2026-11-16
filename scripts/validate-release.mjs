import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRouter} from '../dist/router.js';
import {extraGames, extraPuzzle, prepareExtra} from '../dist/games/extra-puzzles.js';
import {preparePuzzles} from '../dist/games/rot-puzzles.js';

const root=new URL('../dist/',import.meta.url);
for (const game of extraGames) {
  assert.ok(fs.statSync(new URL(`${game}/index.html`,root)).size>0);
  const read = name => JSON.parse(fs.readFileSync(new URL(`games/data/${name}.json`,root)));
  const data = prepareExtra(game, game === 'swaprot' ? undefined : read(game),
    game === 'ladderrot' ? read('ladder-words') : undefined);
  if (game === 'ladderrot') {
    for (let index=0;index<data.rows.length;index++) {
      const day = new Date(index*86400000).toISOString().slice(0,10);
      assert.ok(extraPuzzle(game,data,day).solution.length>=3);
    }
  }
}
for (const game of ['maprot','yearrot','borderrot']) {
  assert.ok(fs.statSync(new URL(`${game}/index.html`,root)).size>0);
  preparePuzzles(game,JSON.parse(fs.readFileSync(new URL(`games/data/${game}.json`,root))));
}
for(const game of ['flags','languages']){
  assert.ok(fs.statSync(new URL(`${game}/index.html`,root)).size>0);
  const items=JSON.parse(fs.readFileSync(new URL(`games/data/${game}.json`,root)));
  assert.ok(items.length>=(game==='flags'?253:50));assert.equal(new Set(items.map(item=>item.id)).size,items.length);assert.equal(new Set(items.map(item=>item.name)).size,items.length);
  for(const item of items){assert.ok(item.id&&item.name);if(game==='flags')assert.ok(fs.statSync(new URL(`games/flags/${item.id}.svg`,root)).size>0);else assert.ok(item.samples.length>=5&&item.samples.every(sample=>typeof sample==='string'&&sample.length>=40));}
}
for(const file of ['assets/train-logo.png','index.html','rewards.js','rewards.css','theme.css','styles.css','app.js','map.js','router.js','data/boroughs.json'])assert.ok(fs.statSync(new URL(file,root)).size>0,`${file} is missing`);
const data=JSON.parse(fs.readFileSync(new URL('data/network.json',root)));
const challenges=JSON.parse(fs.readFileSync(new URL('data/challenges.json',root)));
const demo=data.metadata.feedVersion==='dailyo-demo-v1';
const original=demo?[]:JSON.parse(fs.readFileSync(new URL('./original-challenges.json',import.meta.url)));
const stationIds=Object.keys(data.stations),labels=new Set();
assert.ok(data.metadata.feedVersion&&data.metadata.transferSeconds>0);
for(const [id,station] of Object.entries(data.stations)){
  assert.equal(station.id,id);
  assert.ok(station.name&&station.label&&station.area);
  assert.ok(Number.isFinite(station.lat)&&Number.isFinite(station.lon));
  const key=station.label+' — '+station.area;
  assert.ok(!labels.has(key),`Ambiguous station: ${key}`);labels.add(key);
}
// Build a separate whole-ride graph and solve it with Bellman–Ford. This checks
// the scoring oracle without using the game's Dijkstra traversal or ride helper.
const edgeMap=new Map();
for(const pattern of data.patterns){
  assert.ok(data.routes[pattern.route]&&/^[0-9a-f]{6}$/i.test(data.routes[pattern.route].color));
  assert.ok(pattern.stations.length>1);
  assert.equal(pattern.seconds.length,pattern.stations.length-1);
  assert.equal(pattern.offsets.length,pattern.stations.length);
  assert.ok(pattern.geometry.length>1&&pattern.geometry.every(p=>p.length===2&&p.every(Number.isFinite)));
  pattern.stations.forEach((id,i)=>{
    assert.ok(data.stations[id],`Unknown station ${id}`);
    assert.ok(Number.isInteger(pattern.offsets[i])&&pattern.offsets[i]>=0&&pattern.offsets[i]<pattern.geometry.length);
    if(i)assert.ok(pattern.offsets[i]>=pattern.offsets[i-1]);
    let cost=data.metadata.transferSeconds;
    for(let end=i+1;end<pattern.stations.length;end++){
      const duration=pattern.seconds[end-1];assert.ok(Number.isInteger(duration)&&duration>0);
      cost+=duration;const to=pattern.stations[end],key=id+':'+to;
      if(!edgeMap.has(key)||edgeMap.get(key).cost>cost)edgeMap.set(key,{from:id,to,cost});
    }
  });
}
// Independently add an indoor walk before and/or after each ride.
const walkEdges=new Map();
for(const {from,to,seconds} of data.walkingConnections??[]){
  assert.ok(data.stations[from]&&data.stations[to]&&seconds>0);
  for(const [a,b] of [[from,to],[to,from]]){
    if(!walkEdges.has(a))walkEdges.set(a,[]);
    walkEdges.get(a).push({station:b,seconds});
  }
}
for(const ride of [...edgeMap.values()]){
  for(const start of [{station:ride.from,seconds:0},...(walkEdges.get(ride.from)??[])]){
    for(const end of [{station:ride.to,seconds:0},...(walkEdges.get(ride.to)??[])]){
      if(start.station===end.station)continue;
      const key=start.station+':'+end.station,cost=ride.cost+start.seconds+end.seconds;
      if(!edgeMap.has(key)||edgeMap.get(key).cost>cost)edgeMap.set(key,{from:start.station,to:end.station,cost});
    }
  }
}
const independent=new Map(),edges=[...edgeMap.values()];
function shortestFrom(from){
  if(independent.has(from))return independent.get(from);
  const costs=new Map([[from,-data.metadata.transferSeconds]]);
  for(let pass=0;pass<stationIds.length-1;pass++){
    let changed=false;
    for(const {from:a,to:b,cost} of edges){
      const next=(costs.get(a)??Infinity)+cost;
      if(next<(costs.get(b)??Infinity)){costs.set(b,next);changed=true;}
    }
    if(!changed)break;
  }
  independent.set(from,costs);return costs;
}
const router=createRouter(data),pairs=new Set(),titles=new Map();
const distance=(a,b)=>Math.hypot((a[0]-b[0])*Math.cos((a[1]+b[1])*Math.PI/360),a[1]-b[1])*111.2;
for(const [i,old] of original.entries()){
  const {daily,...current}=challenges[i];assert.deepEqual(current,old);assert.equal(!!daily,old.difficulty==='easy');
}
assert.ok(challenges.length>=5);
for(const [index,challenge] of challenges.entries()){
  const {from,to}=challenge,key=from+':'+to;
  assert.ok(data.stations[from]&&data.stations[to]&&from!==to);
  assert.ok(challenge.fromTitle&&challenge.toTitle&&challenge.fromArea&&challenge.toArea);
  assert.ok(['easy','medium','hard'].includes(challenge.difficulty));
  for(const [title,id] of [[challenge.fromTitle,from],[challenge.toTitle,to]]){
    assert.ok(!titles.has(title)||titles.get(title)===id,`Ambiguous challenge title: ${title}`);titles.set(title,id);
  }
  assert.ok(!pairs.has(key));pairs.add(key);
  const best=router.best(from,to);
  assert.ok(best&&best.seconds>=720&&best.seconds<=2100&&best.legs.length<=3);
  assert.ok(best.legs.reduce((sum,leg)=>sum+leg.stops,0)>=4);
  assert.equal(best.seconds,shortestFrom(from).get(to),`Fastest-route disagreement for ${key}`);
  if(index>=original.length){
    assert.ok(!challenge.daily);assert.equal(new Set(best.legs.map(l=>l.route)).size,best.legs.length);
    if(best.legs.length===1)assert.ok(new Set(router.rides(from).map(l=>l.route)).size>=2,`Trivial starting station: ${key}`);
    const a=data.stations[from],b=data.stations[to],straight=distance([a.lon,a.lat],[b.lon,b.lat]);let length=0;const visited=new Set([from]);
    for(const leg of best.legs){const p=data.patterns[leg.patternIndex],geometry=p.geometry.slice(p.offsets[leg.start],p.offsets[leg.end]+1);assert.ok(p.headsign&&geometry.length>1);for(const id of p.stations.slice(leg.start+1,leg.end+1)){assert.ok(!visited.has(id),`Repeated station in ${key}`);visited.add(id);}for(let i=1;i<geometry.length;i++)length+=distance(geometry[i-1],geometry[i]);}
    assert.ok(straight>=1.6&&length/straight<=2.5,`Poorly proportioned journey: ${key}`);
  }
}
console.log(`Release verified: ${stationIds.length} station complexes, ${data.patterns.length} patterns, ${challenges.length} puzzles. Independent shortest-route checks passed.`);
