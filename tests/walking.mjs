import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const challenges=JSON.parse(fs.readFileSync(new URL('../dist/data/challenges.json',import.meta.url)));
const challenge=challenges.find(c=>c.from==='128'&&c.to==='A09');
assert.ok(challenge);
const browser=await chromium.launch();
try {
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:844}});
    await page.route('**/data/challenges.json',route=>route.fulfill({json:[challenge]}));
    await page.addInitScript(()=>localStorage.setItem('trainrot-game-mode-v2','practice'));
    await page.goto(new URL('/trainrot/',base).href);
    await page.locator('[data-route="A"]').click();
    await page.locator('#reveal').click();
    await page.locator('#next').waitFor({state:'visible'});
    assert.match(await page.locator('.result-route').first().innerText(),/Walk to .*8th Av.*4 min.*Exit and re-enter subway/i);
    assert.match(await page.locator('.result-route').first().innerText(),/A toward/);
    assert.equal((await page.locator('.result-score').count())>0,true);
    await page.reload();await page.locator('#next').waitFor({state:'visible'});
    assert.match(await page.locator('.result-route').first().innerText(),/Walk to .*8th Av/);
    console.log(`${width}px Penn Station walking journey and reload passed`);
    await page.close();
  }
  const page=await browser.newPage();
  const network=JSON.parse(fs.readFileSync(new URL('../dist/data/network.json',import.meta.url)));
  const retired=network.retiredChallenges[0];
  await page.addInitScript(({retired,feed})=>{
    localStorage.setItem('trainrot-game-mode-v2','practice');
    localStorage.setItem(`trainrot-endless-v1:${feed}`,JSON.stringify({seed:'endless:test',position:0,difficulty:retired.difficulty,challenge:{from:retired.from,to:retired.to},state:{phase:'planning',legs:[{route:'R'}],guesses:[]}}));
  },{retired,feed:network.metadata.feedVersion});
  await page.goto(new URL('/trainrot/',base).href);await page.locator('#skip').waitFor();
  assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),[retired.fromTitle,retired.toTitle]);
  assert.equal(await page.locator('.train-sequence li').count(),1);
  console.log('An in-progress retired journey remains playable');
  await page.close();
} finally {await browser.close();}
