import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';

// Failures: an omitted command, duplicate execution, ignored arguments, or a hidden child failure.
test('browser shards cover every package command once and preserve child failures', async () => {
  const root=await mkdtemp(join(tmpdir(),'dailyo-ci-'));
  try {
    await mkdir(join(root,'scripts'));await mkdir(join(root,'tests'));
    await cp(resolve('scripts/ci-browser.mjs'),join(root,'scripts/ci-browser.mjs'));
    await writeFile(join(root,'package.json'),JSON.stringify({type:'module',scripts:{'test:e2e':'node tests/a.mjs && node tests/b.mjs extra && node tests/c.mjs','test:e2e:world':'node tests/d.mjs'}}));
    await writeFile(join(root,'scripts/world-cities.json'),JSON.stringify(['one','two','three','four'].map(slug=>({slug}))));
    await writeFile(join(root,'scripts/browser-timings.json'),JSON.stringify({durationsMs:{'node tests/a.mjs':100,'node tests/b.mjs extra':60,'node tests/c.mjs':40,'node tests/d.mjs':20}}));
    for(const name of ['a','b','c','d'])await writeFile(join(root,`tests/${name}.mjs`),`import {appendFileSync} from 'node:fs';appendFileSync('visited',JSON.stringify(['${name}',...process.argv.slice(2)])+'\\n');`);
    for(let shard=1;shard<=3;shard++)assert.equal(spawnSync(process.execPath,['scripts/ci-browser.mjs',`--shard=${shard}/3`],{cwd:root}).status,0);
    const visited=(await readFile(join(root,'visited'),'utf8')).trim().split('\n').map(line=>JSON.parse(line) as string[]).sort();
    assert.deepEqual(visited.filter(row=>row[0]!=='d'),[['a'],['b','extra'],['c']]);
    assert.deepEqual(visited.filter(row=>row[0]==='d').flatMap(row=>row.slice(1)).sort(),['deliberate-gate-fault']);
    for(const shard of ['0/3','4/3','1/0','wrong'])assert.notEqual(spawnSync(process.execPath,['scripts/ci-browser.mjs',`--shard=${shard}`],{cwd:root}).status,0);
    await writeFile(join(root,'tests/a.mjs'),'process.exitCode=7;');
    assert.notEqual(spawnSync(process.execPath,['scripts/ci-browser.mjs','--shard=1/3'],{cwd:root}).status,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
