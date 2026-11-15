import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const all=JSON.parse(fs.readFileSync(new URL('../dist/data/challenges.json',import.meta.url)));
const browser=await chromium.launch();
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844}});
  const start=all.find(c=>c.fromTitle==='Times Square'&&c.toTitle==='Atlantic Av–Barclays Ctr');
  const reverse=all.find(c=>c.from===start.to&&c.to===start.from);
  const others=all.filter(c=>c.difficulty==='easy'&&c!==start&&c!==reverse).slice(0,8);
  const fixture=[start,reverse,...others];
  await page.route('**/data/challenges.json',r=>r.fulfill({json:fixture}));
  await page.goto(base);await page.locator('[data-route]').first().waitFor();await page.locator('#practice-mode').click();
  await page.evaluate(fixture=>{const key=Object.keys(localStorage).find(k=>k.startsWith('trainrot-endless-v1:'));const s=JSON.parse(localStorage.getItem(key));s.position=0;s.challenge=fixture[0];s.deck=fixture.map(({from,to})=>({from,to}));s.recent=[s.challenge];s.state={phase:'planning',legs:[],guesses:[]};localStorage.setItem(key,JSON.stringify(s));},fixture);
  await page.reload();await page.locator('#skip').waitFor();
  const observed=[];
  for(let i=0;i<5;i++){
   await page.locator('#skip').click();
   const item=await page.locator('.endpoint strong').allTextContents();observed.push(item);
   if(i<4)assert.notDeepEqual(item,[reverse.fromTitle,reverse.toTitle]);
   await page.reload();await page.locator('#skip').waitFor();assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),item);
  }
  assert.deepEqual(observed[4],[reverse.fromTitle,reverse.toTitle]);
  await page.evaluate(({start,reverse,others})=>{const key=Object.keys(localStorage).find(k=>k.startsWith('trainrot-endless-v1:'));const s=JSON.parse(localStorage.getItem(key));s.deck=[...others,start,reverse].map(({from,to})=>({from,to}));s.position=others.length;s.challenge=start;s.recent=[start];s.state={phase:'planning',legs:[],guesses:[]};localStorage.setItem(key,JSON.stringify(s));},{start,reverse,others});
  await page.reload();await page.locator('#skip').waitFor();
  const afterWrap=[];
  for(let i=0;i<fixture.length;i++){await page.locator('#skip').click();afterWrap.push(await page.locator('.endpoint strong').allTextContents());if(i===0){await page.reload();await page.locator('#skip').waitFor();}}
  assert.notDeepEqual(afterWrap[0],[reverse.fromTitle,reverse.toTitle]);
  assert.ok(afterWrap.some(pair=>pair[0]===reverse.fromTitle&&pair[1]===reverse.toTitle),'Deferred reverse remains in the pool');
  const tie=all.find(c=>c.fromTitle==='Grand Central'&&c.toTitle==='Atlantic Av–Barclays Ctr');
  await page.unroute('**/data/challenges.json');await page.route('**/data/challenges.json',r=>r.fulfill({json:[tie]}));
  await page.evaluate(()=>{localStorage.clear();localStorage.setItem('trainrot-game-mode-v2','practice');});await page.reload();await page.locator('[data-route="4"]').click();await page.locator('#reveal').click();
  assert.equal(await page.locator('.result-subtitle').innerText(),'Your route is also a fastest route.');
  await page.reload();await page.locator('#next').waitFor();assert.equal(await page.locator('.result-subtitle').innerText(),'Your route is also a fastest route.');
  await page.close();console.log(`${width}px reverse spacing, reload and tied routes passed`);
 }
}finally{await browser.close();}
