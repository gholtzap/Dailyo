import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createRouter} from '../dist/router.js';

test('train sequences find transfers without committing earlier guesses to a station',()=>{
  const data=JSON.parse(readFileSync(new URL('../dist/data/network.json',import.meta.url)));
  const r=createRouter(data),from='L08',to='M18';
  const first=r.assess(from,to,[{route:'L'}]);
  assert.equal(first.valid,false);assert.equal(first.score,41);
  const second=r.assess(from,to,[{route:'L'},{route:'6'}]);
  assert.equal(second.valid,false);assert.equal(second.legs[0].to,'R20');
  const final=r.assess(from,to,[{route:'L'},{route:'6'},{route:'F'}]);
  assert.equal(final.valid,true);assert.equal(final.score,98);
  assert.deepEqual(final.legs.map(l=>l.to),['R20','D21','M18']);
  assert.equal(final.points.reduce((sum,p)=>sum+p.points,0),final.score);
  assert.equal(r.assess(from,to,[{route:'L'},{route:'M'}]).score,98);
  assert.equal(r.assess(from,to,[{route:'L'},{route:'F'}]).score,100);
  assert.equal(r.assess(from,to,[{route:'L'},{route:'6'},{route:'M'}]).score,95);
  const impossible=r.assess(from,to,[{route:'L'},{route:'7'}]);
  assert.equal(impossible.valid,false);assert.equal(impossible.brokenLeg,1);
  assert.ok(impossible.score>0);assert.equal(impossible.legs.length,1);
});
test('the known indoor links work in both directions in the published network',()=>{
  const network=JSON.parse(readFileSync(new URL('../dist/data/network.json',import.meta.url)));
  const router=createRouter(network);
  for(const [a,b,train] of [['128','A28','A'],['A28','128','1'],['R16','D16','D'],['D16','R16','N'],['142','R27','R'],['R27','142','1'],['138','R25','E'],['R25','138','1'],['M22','R25','E'],['R25','M22','4'],['138','M22','4'],['M22','138','1']]){
    assert.ok(router.rides(a,train).some(ride=>ride.walkBefore?.to===b),`${a} to ${b} for ${train}`);
  }
});
