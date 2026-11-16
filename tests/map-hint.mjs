import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRouter} from '../dist/router.js';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../dist/data/${name}.json`,import.meta.url)));
const challenge=read('challenges')[0];
const best=createRouter(read('network')).best(challenge.from,challenge.to);
const browser=await chromium.launch();
try{
 for(const width of [390,1440])for(const reveal of [false,true]){
  const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});await page.route('**/data/challenges.json',r=>r.fulfill({json:[challenge]}));await page.goto(new URL('/trainrot/',base).href);await page.locator('.map-hint summary').waitFor();
  await page.locator('.map-hint summary').click();assert.match(await page.locator('.map-hint').innerText(),/makes this journey unscored/);
  if(reveal){await page.locator('#hint').click();assert.match(await page.locator('#city-map').getAttribute('aria-label'),/Subway lines are shown/);assert.equal(await page.locator('.map-hint').count(),0);}
  else{await page.locator('.map-hint summary').click();assert.equal(await page.locator('.map-hint').getAttribute('open'),null);assert.match(await page.locator('#city-map').getAttribute('aria-label'),/Subway lines are hidden/);}
  for(const {route} of best.legs)await page.locator(`[data-route="${route}"]`).click();
 await page.locator('#reveal').click();await page.locator('#copy-results').waitFor();
  assert.equal(await page.locator('.result-score').textContent(),reveal?'—':'100 points');await page.reload();await page.locator('#copy-results').waitFor();assert.equal(await page.locator('.result-score').textContent(),reveal?'—':'100 points');
  await page.close();console.log(`${width}px: ${reveal?'revealed map is unscored':'dismissed hint keeps score'} after reload`);
 }
}finally{await browser.close();}
