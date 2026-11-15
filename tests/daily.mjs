import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';
import {createRouter} from '../dist/router.js';
const network=JSON.parse(fs.readFileSync(new URL('../dist/data/network.json',import.meta.url)));
const challenges=JSON.parse(fs.readFileSync(new URL('../dist/data/challenges.json',import.meta.url)));
const router=createRouter(network);
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const browser=await chromium.launch();
try {
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:844},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(),other=await context.newPage();
  await Promise.all([page.goto(base),other.goto(base)]);await Promise.all([page.locator('[data-route]').first().waitFor(),other.locator('[data-route]').first().waitFor()]);
  const journey=p=>p.locator('.endpoint strong').allTextContents();
  const daily=await journey(page);assert.deepEqual(await journey(other),daily);
  const challenge=challenges.find(c=>c.fromTitle===daily[0]&&c.toTitle===daily[1]);
  const best=router.best(challenge.from,challenge.to);
  const firstGuess=Object.keys(network.routes).find(route=>!router.assess(challenge.from,challenge.to,[{route}]).valid);
  await other.locator(`[data-route="${firstGuess}"]`).click();await other.locator('#reveal').click();
  await other.getByRole('button',{name:'Undo last train'}).click();
  for(const leg of best.legs)await other.locator(`[data-route="${leg.route}"]`).click();
  await other.locator('#reveal').click();await other.locator('#copy-results').waitFor();
  await other.waitForFunction(()=>document.querySelector('.result-score')?.textContent.includes('100'));
  await other.locator('#copy-results').click();const shared=await other.evaluate(()=>navigator.clipboard.readText());
  assert.match(shared,/100 points/);assert.match(shared,/[⬛🟨]🟩/);assert.equal((shared.match(/[⬛🟨🟩]/gu)??[]).length,2);
  for(const name of daily)assert.ok(!shared.includes(name));
  await other.reload();await other.locator('#copy-results').click();assert.equal(await other.evaluate(()=>navigator.clipboard.readText()),shared);
  await page.getByRole('button',{name:'Show answer',exact:true}).click();await page.getByRole('button',{name:'Copy results',exact:true}).click();
  const text=await page.evaluate(()=>navigator.clipboard.readText());assert.match(text,/trainrot.*\d{4}-\d{2}-\d{2}/i);assert.doesNotMatch(text,/[⬛🟨🟩]/u);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('denied'))},configurable:true}));
  await page.getByRole('button',{name:'Copy results',exact:true}).click();assert.equal(await page.getByLabel('Results to copy').inputValue(),text);
  await page.reload();await page.getByRole('button',{name:'Copy results',exact:true}).waitFor();assert.deepEqual(await journey(page),daily);
  await page.getByRole('button',{name:'Practice',exact:true}).click();await page.locator('[data-route]').first().waitFor();await page.getByRole('button',{name:'Skip',exact:true}).click();await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.getByRole('button',{name:'Daily',exact:true}).click();await page.getByRole('button',{name:'Copy results',exact:true}).waitFor();assert.deepEqual(await journey(page),daily);
  await context.close();console.log(`${width}px daily, sharing, persistence, and practice passed`);
 }
 const rollover=await browser.newPage();await rollover.clock.install({time:new Date('2026-11-09T16:00:00Z')});await rollover.goto(base);await rollover.locator('[data-route]').first().waitFor();
 const previous=await rollover.locator('.endpoint strong').allTextContents();await rollover.locator('#show-answer').click();await rollover.locator('#copy-results').waitFor();
 await rollover.clock.setFixedTime(new Date('2026-11-10T16:00:00Z'));await rollover.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 assert.equal(await rollover.locator('#copy-results').count(),0);await rollover.locator('[data-route]').first().waitFor();assert.notDeepEqual(await rollover.locator('.endpoint strong').allTextContents(),previous);await rollover.close();console.log('Daily rollover passed');
} finally {await browser.close();}
