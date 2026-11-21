import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const match=process.argv[2]?.match(/^--shard=(\d+)\/(\d+)$/);
assert.ok(match && process.argv.length===3,'Use --shard=index/count');
const index=Number(match[1]),count=Number(match[2]);
const {scripts}=JSON.parse(readFileSync('package.json','utf8'));
const {durationsMs}=JSON.parse(readFileSync('scripts/browser-timings.json','utf8'));
const cities=JSON.parse(readFileSync('scripts/world-cities.json','utf8'));
assert.ok(count>=1 && count<=cities.length,'Invalid city shard count');
assert.equal(new Set(cities.map(city=>city.slug)).size,cities.length,'City slugs must be unique');
const groups=Array.from({length:count},()=>[]);
for(const [i,city] of cities.entries()){assert.match(city.slug,/^[a-z0-9-]+$/);groups[i%count].push(city.slug);}
const world=groups.map(cities=>`${scripts['test:e2e:world']} ${cities.join(' ')}`);
for(const command of world)durationsMs[command]=durationsMs[scripts['test:e2e:world']]/count;
const commands=[...scripts['test:e2e'].split(' && '),...world];
assert.equal(new Set(commands).size,commands.length,'Each browser command must occur once');
assert.ok(index>=1 && index<=count && count<=commands.length,'Select a nonempty shard');
const fallback=Math.max(1,...Object.values(durationsMs));
const duration=command=>Number.isFinite(durationsMs[command]) && durationsMs[command]>0 ? durationsMs[command] : fallback;
const shards=Array.from({length:count},()=>({commands:[],estimatedMs:0}));
for(const command of commands.sort((a,b)=>duration(b)-duration(a)||a.localeCompare(b))){
 const shard=shards.reduce((best,next)=>next.estimatedMs<best.estimatedMs?next:best);
 shard.commands.push(command);shard.estimatedMs+=duration(command);
}
mkdirSync('test-results',{recursive:true});
const receipt={index,count,...shards[index-1],results:[]};
for(const command of receipt.commands){
 const [program,file,...args]=command.split(' ');
 assert.equal(program,'node');assert.match(file,/^tests\/[\w-]+\.mjs$/);
 const start=performance.now();const result=spawnSync(process.execPath,[file,...args],{stdio:'inherit',env:{...process.env,WORLD_TEST_CITIES:''}});
 receipt.results.push({command,durationMs:performance.now()-start,status:result.status,signal:result.signal});
 writeFileSync(`test-results/ci-browser-${index}.json`,JSON.stringify(receipt,null,2)+'\n');
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
