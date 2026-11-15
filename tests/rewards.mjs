import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const data=JSON.parse(await fs.readFile(new URL('../dist/data/challenges.json',import.meta.url)));
await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
const browser=await chromium.launch(),reports=[];
try{
  for(const width of [390,1440])for(const reducedMotion of ['reduce','no-preference']){
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion,colorScheme:'dark'});
    let puzzle=data.find(c=>c.from==='L08'&&c.to==='M18');
    await page.route('**/data/challenges.json',r=>r.fulfill({json:[puzzle]}));
    await page.goto(base);await page.locator('#practice-mode').click();await page.locator('#reveal').waitFor();
    const add=route=>page.locator(`[data-route="${route}"]`).click();
    const check=()=>page.locator('#reveal').click();
    const score=()=>page.locator('.reward-number').textContent();
    await add('L');const first=await page.locator('#reveal').evaluate(button=>{button.click();return document.querySelector('.reward-number')?.textContent;});
    assert.equal(first,reducedMotion==='reduce'?'41':'0','Count-up starts at the previous checked score');
    await page.waitForFunction(()=>document.querySelector('.reward-number')?.textContent==='41');
    assert.equal(await page.locator('.reward-gain').textContent(),'+41 points');
    assert.equal(await page.locator('.train-sequence .reward-accepted').count(),1);
    await add('6');await check();
    await page.waitForFunction(()=>document.querySelector('.reward-number')?.textContent==='64');
    assert.equal(await page.locator('.reward-gain').textContent(),'+23 points');
    await add('F');const start=await page.locator('#reveal').evaluate(button=>{button.click();return {number:document.querySelector('.reward-number')?.textContent,label:document.querySelector('.result-score')?.getAttribute('aria-label')};});
    assert.equal(start.number,reducedMotion==='reduce'?'98':'64','Completion keeps the old score while the route draws');assert.match(start.label,/98/);assert.equal(await page.locator('#next').isEnabled(),true);
    await page.waitForFunction(()=>document.querySelector('.reward-number')?.textContent==='98');
    assert.equal(await page.locator('.planner').getAttribute('data-score-tier'),'great');
    assert.equal(await page.locator('.reward-gain').textContent(),'+34 points');
    await page.reload();await page.locator('#next').waitFor();
    assert.equal(await page.locator('.reward-gain').count(),0);
    assert.equal(await page.locator('.planner').getAttribute('data-reward-phase'),'idle');
    assert.equal(await page.locator('.planner').getAttribute('data-score-tier'),'great');
    // A perfect result receives gold; an immediate next action cancels its work.
    await page.locator('#next').click();await add('L');await add('F');await check();
    assert.equal(await page.locator('.planner').getAttribute('data-score-tier'),'perfect');
    if(reducedMotion==='reduce'){
      assert.equal(await score(),'100');
      assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
    }else{
      assert.ok(await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running')));
      assert.equal(await page.locator('.reward-ripple').count(),1);
    }
    await page.screenshot({path:`test-results/${width}-${reducedMotion}-reward.png`,fullPage:true});
    await page.locator('#next').click();await page.locator('#reveal').waitFor();
    assert.equal(await page.locator('.planner').getAttribute('data-reward-phase'),'idle');
    assert.equal(await page.locator('.reward-gain,.reward-ripple').count(),0);
    await page.locator('.map-hint summary').click();await page.locator('#hint').click();await add('L');await add('F');await check();
    assert.equal(await page.locator('.planner').getAttribute('data-score-tier'),'neutral');
    assert.equal(await page.locator('.reward-gain,.reward-ripple').count(),0);
    await page.locator('#next').click();await page.locator('#skip').click();
    assert.equal(await page.locator('.planner').getAttribute('data-score-tier'),'neutral');
    assert.equal(await page.locator('.reward-gain,.reward-ripple').count(),0);
    puzzle=data.find(c=>c.from==='D20'&&c.to==='R31');await page.evaluate(()=>{localStorage.clear();localStorage.setItem('trainrot-game-mode-v2','practice');});await page.reload();await page.locator('#reveal').waitFor();
    await add('A');await add('R');await check();await page.waitForFunction(()=>document.querySelector('.reward-number')?.textContent==='73');
    assert.equal(await page.locator('.planner').getAttribute('data-score-tier'),'neutral');assert.equal(await page.locator('.reward-ripple').count(),0);
    await page.locator('#next').click();await add('B');await check();
    if(reducedMotion==='no-preference')await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.querySelector('.reward-number')?.textContent==='100');
    assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
    await page.screenshot({path:`test-results/${width}-${reducedMotion}-perfect-settled.png`,fullPage:true});
    reports.push({width,reducedMotion,partialGains:[41,23],completionGain:34,nearPerfect:98,perfect:100,reload:true,cancellation:true,hints:true,skips:true,neutral73:true,motionChange:true});
    await page.close();
  }
  console.log(JSON.stringify(reports,null,2));
}finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/rewards.json',JSON.stringify(reports,null,2));await browser.close();}
