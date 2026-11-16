import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createRouter} from '../dist/router.js';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const original=JSON.parse(fs.readFileSync(new URL('../scripts/original-challenges.json',import.meta.url)));
const expanded=JSON.parse(fs.readFileSync(new URL('../dist/data/challenges.json',import.meta.url)));
const network=JSON.parse(fs.readFileSync(new URL('../dist/data/network.json',import.meta.url)));
const router=createRouter(network);
const seedDeck=(seed,items)=>{let hash=2166136261;for(const c of seed)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;const deck=[...items];for(let i=deck.length-1;i>0;i--){hash=(Math.imul(hash,1664525)+1013904223)>>>0;const j=hash%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;};
assert.ok(expanded.length>original.length);
for(const [i,c] of original.entries()){const {daily,...same}=expanded[i];assert.deepEqual(same,c);assert.equal(!!daily,c.difficulty==='easy');}
const browser=await chromium.launch();
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844}});await page.clock.install({time:new Date('2026-11-14T16:00:00Z')});await page.goto(new URL('/trainrot/',base).href);await page.locator('[data-route]').first().waitFor();
  const oldDeck=seedDeck('trainrot-daily-v2',original.filter(c=>c.difficulty==='easy'));
  const day=Math.floor(Date.parse('2026-11-14T00:00:00Z')/86400000),old=oldDeck[day%oldDeck.length];
  assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),[old.fromTitle,old.toTitle]);
  await page.evaluate(({feed})=>{localStorage.setItem(`trainrot-daily-v2:${feed}:2026-11-14`,JSON.stringify({phase:'planning',legs:[{route:'1'}],guesses:[]}));},{feed:network.metadata.feedVersion});
  await page.reload();await page.locator('[data-route]').first().waitFor();assert.equal(await page.locator('.train-sequence li').count(),1);
  assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),[old.fromTitle,old.toTitle]);
  const practice=original.filter(c=>c.difficulty==='easy'),picked=practice[4],savedDeck=practice.map(({from,to})=>({from,to}));
  await page.evaluate(({feed,picked,savedDeck})=>{localStorage.setItem('trainrot-game-mode-v2','practice');localStorage.setItem(`trainrot-endless-v1:${feed}`,JSON.stringify({seed:'endless:existing',position:4,difficulty:'easy',challenge:picked,deck:savedDeck,recent:[picked],state:{phase:'planning',legs:[{route:'1'}],guesses:[]}}));},{feed:network.metadata.feedVersion,picked,savedDeck});
  await page.reload();await page.locator('[data-route]').first().waitFor();assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),[picked.fromTitle,picked.toTitle]);assert.equal(await page.locator('.train-sequence li').count(),1);
  const saved=await page.evaluate(feed=>JSON.parse(localStorage.getItem(`trainrot-endless-v1:${feed}`)),network.metadata.feedVersion);
  assert.deepEqual(saved.deck.slice(0,savedDeck.length),savedDeck);assert.ok(saved.deck.length>savedDeck.length);assert.equal(saved.position,4);
  await page.clock.setFixedTime(new Date('2026-11-15T16:00:00Z'));await page.locator('#daily-mode').click();
  const newDaily=seedDeck('trainrot-daily-v3',expanded.filter(c=>c.difficulty==='easy'))[Math.floor(Date.parse('2026-11-15T00:00:00Z')/86400000)%expanded.filter(c=>c.difficulty==='easy').length];
  assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),[newDaily.fromTitle,newDaily.toTitle]);
  for(const difficulty of ['easy','medium','hard']){
   const challenge=expanded.slice(original.length).find(c=>c.difficulty===difficulty);
   await page.route('**/data/challenges.json',r=>r.fulfill({json:[challenge]}));
   await page.evaluate(()=>{localStorage.clear();localStorage.setItem('trainrot-game-mode-v2','practice');});await page.reload();await page.locator('[data-route]').first().waitFor();
   assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),[challenge.fromTitle,challenge.toTitle]);
   for(const leg of router.best(challenge.from,challenge.to).legs)await page.locator(`[data-route="${leg.route}"]`).click();
   await page.locator('#reveal').click();await page.locator('#next').waitFor();assert.match(await page.locator('.result-score').getAttribute('aria-label'),/100 points/);
   await page.unroute('**/data/challenges.json');
  }
  await page.close();console.log(`${width}px original progress and new journeys passed`);
 }
}finally{await browser.close();}
