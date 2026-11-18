import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const plan=read('world-source-plan.json'),feeds=read('world-gtfs.json');
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
run('python3',['scripts/fetch-world-sources.py']);
const scheduled=Object.keys(plan).filter(slug=>plan[slug]==='gtfs');
run('python3',['scripts/prepare-world-gtfs.py',...new Set(scheduled.map(slug=>feeds[slug].file))]);
run('python3',['scripts/build-world-networks.py',...Object.keys(plan).filter(slug=>plan[slug]!=='snapshot')]);
run('python3',['scripts/build-world-snapshots.py',...Object.keys(plan).filter(slug=>plan[slug]==='snapshot')]);
run('node',['scripts/build-world-puzzles.mjs']);
run('node',['scripts/build-world-pages.mjs']);
run('node',['scripts/validate-world.mjs']);
