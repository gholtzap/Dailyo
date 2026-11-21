import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {prepareExtra,extraPuzzle} from '../dist/games/extra-puzzles.js';
import {rushSeed} from './rush-helpers.mjs';

const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const browser=await chromium.launch(),receipts=[];
await fs.mkdir('test-results/rush-improvements',{recursive:true});
try{
 for(const width of [390,1440])for(const game of ['scalerot','cluerot','ladderrot']){
  const page=await browser.newPage({viewport:{width,height:1000},colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const raw=JSON.parse(await fs.readFile(`dist/games/data/${game}.json`,'utf8')).slice(0,5);
  const words=game==='ladderrot'?JSON.parse(await fs.readFile('dist/games/data/ladder-words.json','utf8')):undefined;
  const data=prepareExtra(game,raw,words);
  // A five-question pool makes exhaustion and the cycle boundary observable.
  await page.route(`**/games/data/${game}.json`,route=>route.fulfill({json:raw}));
  const time=new Date('2026-11-21T17:00:00Z');
  await page.clock.install({time});await page.clock.pauseAt(new Date(+time+1000));
  await page.goto(`${base}/rush/${game}/`);
  const ids=[];
  for(let round=0;round<6;round++){
   await page.locator('#rush-status').filter({hasText:`Round ${round+1}`}).waitFor();
   const seed=await rushSeed(page,game),q=extraPuzzle(game,data,`${seed}:${round}`);
   ids.push(q.id);
   const child=page.frameLocator(`iframe[title="${game}"]`);
   await child.getByRole('heading',{name:game==='scalerot'?q.prompt:game==='cluerot'?'Clue 1 of 5':`${q.start.toUpperCase()} to ${q.goal.toUpperCase()}`,exact:true}).waitFor();
   if(game==='scalerot'){await child.getByRole('spinbutton').fill(String(q.actual));await child.getByRole('button',{name:'Check estimate'}).click();}
   if(game==='cluerot'){await child.getByRole('textbox').fill(q.answer);await child.getByRole('button',{name:'Guess',exact:true}).click();}
   if(game==='ladderrot')for(const word of q.solution.slice(1)){await child.getByRole('textbox').fill(word);await child.getByRole('button',{name:'Add word'}).click();}
   await page.locator('#rush-status').filter({hasText:'Correct'}).waitFor();
   await page.clock.fastForward(200);
  }
  assert.equal(new Set(ids.slice(0,5)).size,5,'Use the entire pool before repeating');
  assert.equal(ids[5],ids[0],'Start the next full deck after exhaustion');
  assert.notEqual(ids[5],ids[4],'Do not repeat at the cycle boundary');
  assert.deepEqual(errors,[]);receipts.push({width,game,ids});await page.close();
 }
}finally{await browser.close();await fs.writeFile('test-results/rush-improvements/decks.json',JSON.stringify(receipts,null,2));}
console.log('Rush decks: all five questions before repeating, across cycle boundaries, at 390px and 1440px');
