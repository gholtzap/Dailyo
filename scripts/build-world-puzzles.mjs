import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRouter} from '../dist/router.js';
import {seededDeck} from '../dist/daily/puzzles.js';
const cities=JSON.parse(fs.readFileSync(new URL('./world-cities.json',import.meta.url)));
const selected=new Set(process.argv.slice(2));
for(const city of cities){
 if(city.slug==='nyc'||selected.size&&!selected.has(city.slug))continue;
 const dir=new URL(`../dist/world-data/${city.slug}/`,import.meta.url);
 const network=JSON.parse(fs.readFileSync(new URL('network.json',dir)));
 const router=createRouter(network),ids=seededDeck(`world-puzzles-v1:${city.slug}`,Object.keys(network.stations));
 const pool=[],seen=new Set();let rng=2166136261;
 for(const c of city.slug)rng=Math.imul(rng^c.charCodeAt(0),16777619)>>>0;
 const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;};
 const target=Math.min(366,ids.length*(ids.length-1));
 // Restrict source stations to a diverse deterministic sample to reuse rides.
 const starts=ids.slice(0,Math.min(36,ids.length));
 for(let attempt=0;attempt<30000&&pool.length<target;attempt++){
  const from=starts[random()%starts.length],to=ids[random()%ids.length],key=from+':'+to;
  if(from===to||seen.has(key))continue;seen.add(key);
  const best=router.best(from,to);
  if(!best||best.legs.length>6||best.seconds<100||best.seconds>10800)continue;
  if(best.legs.length===1&&best.legs[0].stops<2)continue;
  const a=network.stations[from],b=network.stations[to];
  pool.push({from,to,fromTitle:a.label,toTitle:b.label,fromArea:a.area,toArea:b.area,difficulty:'easy',complexity:best.seconds+best.legs.length*600});
 }
 assert.ok(pool.length>=6,`${city.slug}: insufficient playable pairs (${pool.length})`);
 pool.sort((a,b)=>a.complexity-b.complexity||a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
 pool.forEach((c,i)=>{c.difficulty=i<pool.length/3?'easy':i<pool.length*2/3?'medium':'hard';delete c.complexity;});
 fs.writeFileSync(new URL('challenges.json',dir),JSON.stringify(pool));
 console.log(`${city.slug}: ${pool.length} verified puzzles`);
}
