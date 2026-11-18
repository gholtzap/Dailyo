import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRouter} from '../dist/router.js';
import {worldDailyChallenge} from '../dist/world.js';
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root)));
const cities=read('world-data/cities.json');
assert.equal(cities.length,98);assert.equal(new Set(cities.map(c=>c.slug)).size,98);
let count=0;
for(const city of cities){
 assert.match(city.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
 const html=fs.readFileSync(new URL(`trainrot-world/${city.slug}/index.html`,root),'utf8');assert.ok(html.includes(`data-world-city="${city.slug}"`));
 const network=read(city.slug==='nyc'?'data/network.json':`world-data/${city.slug}/network.json`);
 const challenges=read(city.slug==='nyc'?'data/challenges.json':`world-data/${city.slug}/challenges.json`);
 assert.ok(Object.keys(network.stations).length>=3);assert.ok(challenges.length>=6);
 for(const [id,s] of Object.entries(network.stations)){assert.equal(s.id,id);assert.ok(s.name&&s.label);assert.ok(Number.isFinite(s.lon)&&Number.isFinite(s.lat)&&Math.abs(s.lon)<=180&&Math.abs(s.lat)<=90);}
 for(const [id,r] of Object.entries(network.routes)){assert.ok(r.name);assert.match(r.color,/^[a-f0-9]{6}$/i);}
 for(const p of network.patterns){assert.ok(network.routes[p.route]);assert.ok(p.stations.length>=2);assert.equal(p.seconds.length,p.stations.length-1);assert.equal(p.offsets.length,p.stations.length);assert.ok(p.stations.every(s=>network.stations[s]));assert.ok(p.seconds.every(s=>Number.isInteger(s)&&s>0));assert.ok(p.geometry.every(p=>p.length===2&&p.every(Number.isFinite)));assert.ok(p.offsets.every((n,i)=>Number.isInteger(n)&&n>=0&&n<p.geometry.length&&(!i||n>=p.offsets[i-1])));}
 const router=createRouter(network);
 for(const c of challenges){assert.ok(['easy','medium','hard'].includes(c.difficulty));const best=router.best(c.from,c.to);assert.ok(best&&best.legs.length<=6,`${city.slug}: unsolvable challenge`);const grade=router.grade(c.from,c.to,[],best.legs.map(l=>({route:l.route})));assert.equal(grade.score,100,`${city.slug}: fastest sequence was not accepted`);count++;}
 // Independent sparse graph: a station boards a particular pattern at a
 // particular position, rides its directed edges, and can alight at any stop.
 const graph=new Map(),add=(a,b,w)=>{if(!graph.has(a))graph.set(a,[]);graph.get(a).push([b,w]);};
 network.patterns.forEach((p,index)=>p.stations.forEach((s,i)=>{const key=`p:${index}:${i}`;add(s,key,network.metadata.transferSeconds);add(key,s,0);if(i+1<p.stations.length)add(key,`p:${index}:${i+1}`,p.seconds[i]);}));
 for(const walk of network.walkingConnections??[]){add(walk.from,walk.to,walk.seconds);add(walk.to,walk.from,walk.seconds);}
 function independent(from,to){
  const costs=new Map([[from,0]]),queue=[from];let position=0;const pending=new Set([from]);
  while(position<queue.length){const a=queue[position++];pending.delete(a);for(const [b,w] of graph.get(a)??[]){const cost=costs.get(a)+w;if(cost<(costs.get(b)??Infinity)){costs.set(b,cost);if(!pending.has(b)){pending.add(b);queue.push(b);}}}}
  return costs.get(to)-network.metadata.transferSeconds;
 }
 for(const day of ['2026-11-17','2026-12-31','2027-03-02']){
  const c=worldDailyChallenge(challenges,day,city.slug),expected=router.best(c.from,c.to).seconds;
  // NYC's special indoor walk model is independently checked by the existing
  // NYC validator; a generic walk edge would permit chained street walks.
  if(city.slug!=='nyc')assert.equal(independent(c.from,c.to),expected,`${city.slug}: route oracle disagreement`);
 }
 console.log(`${city.slug}: ${challenges.length} routes and independent oracle passed`);
}
console.log(`${cities.length} cities; ${count} solvable puzzle routes validated.`);
