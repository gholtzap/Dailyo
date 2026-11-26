import { setAngle } from "./angle-helpers.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {perceptionPuzzle} from '../dist/games/perception-puzzles.js';
import {rushSeed} from './rush-helpers.mjs';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const policy=JSON.parse(await fs.readFile('ui-policy.json','utf8'));
const prices=JSON.parse(await fs.readFile('dist/games/data/pricerot.json','utf8')).slice(0,5).map(row=>({...row,cents:1000}));
const browser=await chromium.launch(),reports=[];
await fs.mkdir('test-results/rush-improvements',{recursive:true});
try{
 for(const width of [390,1440])for(const [game,guess,correct] of [['pricerot',12,true],['pricerot',13.1,false],['anglerot',27,true],['anglerot',28,false]]){
  const page=await browser.newPage({viewport:{width,height:1000},colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(game==='pricerot')await page.route('**/games/data/pricerot.json',route=>route.fulfill({json:prices}));
  const time=new Date('2026-11-21T17:00:00Z');await page.clock.install({time});await page.clock.pauseAt(new Date(+time+1000));
  await page.goto(`${base}/rush/${game}/`);await page.locator('#rush-status').filter({hasText:'Round 1'}).waitFor();
  const child=()=>page.frameLocator(`iframe[title="${game}"]`);
  if(game==='pricerot'){await child().getByRole('spinbutton').fill(String(guess));await child().getByRole('button',{name:'Check price'}).click();}
  else{
   const q=perceptionPuzzle('anglerot',await rushSeed(page,'anglerot'),0);
   if(await child().getByRole('button',{name:'Start round',exact:true}).count())await child().getByRole('button',{name:'Start round',exact:true}).click();
   await setAngle(child(), (q.target+guess)%360);await child().getByRole('button',{name:'Check angle'}).click();
  }
  await page.locator('#rush-status').filter({hasText:correct?'Correct':'Missed'}).waitFor();
  await page.getByRole('button',{name:'Keep answer',exact:true}).click();
  await child().getByRole('heading',{name:`${correct?'Within':'Outside'} Rush tolerance`,exact:true}).waitFor();
  if(game==='pricerot'){
   assert.match(await child().locator('.visual-reveal').innerText(),new RegExp(`Recorded price: \\$10.00.*${correct?'20':'31'}% off`));
   assert.doesNotMatch(await child().locator('.visual-reveal').innerText(),/\/ 100 points/);
  }else assert.match(await child().locator('.perception-feedback').innerText(),new RegExp(`${guess}° off`));
  await page.clock.resume();reports.push({width,game,guess,correct,...await checkPage(page,policy)});
  await page.screenshot({path:`test-results/rush-improvements/feedback-${game}-${correct}-${width}.png`});
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  if(correct){
   await page.getByRole('button',{name:'Next',exact:true}).click();await page.locator('#rush-status').filter({hasText:'Round 2'}).waitFor();
   if(game==='pricerot')await child().getByRole('spinbutton').fill('10');
   else{const q=perceptionPuzzle('anglerot',await rushSeed(page,'anglerot'),1);await setAngle(child(),q.target);}
   await page.clock.runFor(game==='pricerot'?17999:19999);
   // Model a correct answer message crossing the host deadline before its next ticker.
   await page.evaluate(()=>{const now=performance.now.bind(performance);Object.defineProperty(performance,'now',{value:()=>now()+1000});});
   await child().getByRole('button',{name:game==='pricerot'?'Check price':'Check angle',exact:true}).click();
   await page.locator('#rush-status').filter({hasText:'Time’s up'}).waitFor();
   await child().getByRole('heading',{name:'Time’s up',exact:true}).waitFor();
   await page.getByRole('button',{name:'See recap',exact:true}).click();
   assert.match(await page.locator('#rush-score').innerText(),/^1 correct/,'A correct but late answer never earns credit');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();await fs.writeFile('test-results/rush-improvements/feedback.json',JSON.stringify(reports,null,2));}
assert.deepEqual(reports.flatMap(r=>r.findings),[]);
console.log('Rush feedback: price boundary, 31% miss, perception 69/70 boundary, timeout and UI policy at 390px and 1440px');
