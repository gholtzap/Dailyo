import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4175';
const cities=JSON.parse(fs.readFileSync(new URL('../scripts/world-cities.json',import.meta.url)));
const browser=await chromium.launch({args:['--no-proxy-server']});
const selected=new Set([...(process.env.WORLD_TEST_CITIES??'').split(',').filter(Boolean),...process.argv.slice(2)]);
try{
 for(const width of [320,1440]){
  const context=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']});
  // Actual grade replay is checked separately against the server's validator.
  // Keep browser QA out of the public rankings database.
  await context.route('**/api/daily-score',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({lower:0,tied:0,others:0,score:100})}));
  const page=await context.newPage(),errors=[];
  await page.clock.setFixedTime(new Date('2026-11-18T17:00:00Z'));
  page.on('pageerror',e=>errors.push(e.message));
  for(const city of cities){
   if(selected.size&&!selected.has(city.slug))continue;
   await page.goto(new URL(`/trainrot-world/${city.slug}/`,base).href);
   await page.locator('[data-route]').first().waitFor();
   assert.equal(await page.locator('.world-bar h1').textContent(),city.name);
   if(['london','tokyo','nyc'].includes(city.slug)){fs.mkdirSync(new URL('../test-results/world/',import.meta.url),{recursive:true});await page.screenshot({path:new URL(`../test-results/world/${city.slug}-${width}.png`,import.meta.url).pathname,fullPage:true});}
   assert.equal(await page.locator('#daily-mode').getAttribute('aria-pressed'),'true');
   const solution=await page.evaluate(async slug=>{
    const prefix=slug==='nyc'?'/data/':`/world-data/${slug}/`;
    const [network,challenges,{createRouter},{worldDailyChallenge},{dailyDate}]=await Promise.all([
     ...['network','challenges'].map(n=>fetch(prefix+n+'.json').then(r=>r.json())),import('/router.js'),import('/world.js'),import('/daily/puzzles.js')]);
    const c=worldDailyChallenge(challenges,dailyDate(),slug),best=createRouter(network).best(c.from,c.to);
    return {routes:best.legs.map(l=>l.route),from:c.fromTitle,to:c.toTitle};
   },city.slug);
   assert.deepEqual(await page.locator('.endpoint strong').allTextContents(),[solution.from,solution.to]);
   for(const route of solution.routes){
    if(await page.locator('#line-search').count())await page.locator('#line-search').fill('');
    await page.locator(`[data-route="${route}"]`).click();
   }
   await page.getByRole('button',{name:'Check route',exact:true}).click();
   await page.locator('.result-score').waitFor();await page.waitForFunction(()=>document.querySelector('.result-score')?.textContent.includes('100'));assert.match((await page.locator('.result-score').textContent()).trim(),/^100\s*points$/,`${city.slug}: optimal answer rejected`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${city.slug}: horizontal overflow at ${width}px`);
   const view=await page.locator('#city-map').getAttribute('viewBox');assert.ok(view.split(' ').every(n=>Number.isFinite(Number(n))));
   await page.getByRole('button',{name:'Copy results',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#copy-status')?.textContent==='Copied');
   const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(copied.includes(city.name));assert.ok(copied.includes(`/trainrot-world/${city.slug}/`));
   await page.reload();try{await page.locator('.result-score').waitFor();}catch(error){console.error('Reload failed',city.slug,await page.locator('body').innerText());console.error(await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.includes(document.body.dataset.worldCity)).map(([key,value])=>[key,value.slice(0,1200)])));throw error;}await page.waitForFunction(()=>document.querySelector('.result-score')?.textContent.includes('100'));assert.match((await page.locator('.result-score').textContent()).trim(),/^100\s*points$/);
   await page.getByRole('button',{name:'Practice',exact:true}).click();await page.locator('[data-route]').first().waitFor();
   await page.locator('#difficulty').selectOption('hard');await page.getByRole('button',{name:'Show answer',exact:true}).click();await page.locator('#next').waitFor();
   await page.locator('#next').click();await page.locator('[data-route]').first().waitFor();
   assert.deepEqual(errors,[],`${city.slug}: browser errors`);
   console.log(`${width}px ${city.slug}: solve, share, restore and practice passed`);
  }
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await page.clock.setFixedTime(new Date('2026-11-18T17:00:00Z'));
 await page.goto(new URL('/trainrot-world/',base).href);await page.waitForURL('**/trainrot-world/nyc/');await page.locator('[data-route]').first().waitFor();
 await page.goto(new URL('/trainrot-world/london/',base).href);await page.locator('[data-route]').first().waitFor();
 await page.locator('[data-route]').first().click();const draft=await page.locator('.train-sequence').textContent();
 await page.locator('#change-city').click();await page.locator('#city-search').fill('zzzzzz');assert.equal(await page.locator('#city-results a').count(),0);
 await page.locator('#city-search').fill('paris');await page.locator('#city-results a').click();await page.waitForURL('**/trainrot-world/paris/');await page.locator('[data-route]').first().waitFor();assert.equal(await page.locator('.train-sequence').count(),0);
 await page.locator('#change-city').click();await page.locator('#city-search').fill('london');await page.locator('#city-search').press('Enter');await page.waitForURL('**/trainrot-world/london/');await page.locator('.train-sequence').waitFor();assert.equal(await page.locator('.train-sequence').textContent(),draft);
 await page.locator('#change-city').click();await page.locator('#city-search').fill('sao paulo');assert.equal(await page.locator('#city-results a').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('#world-city-dialog').isVisible(),false);
 await page.getByRole('button',{name:'Practice',exact:true}).click();await page.goto(new URL('/trainrot-world/paris/',base).href);await page.locator('[data-route]').first().waitFor();assert.equal(await page.locator('#daily-mode').getAttribute('aria-pressed'),'true');
 const unknown=await page.goto(new URL('/trainrot-world/not-a-city/',base).href);assert.equal(unknown.status(),404);
 await context.close();console.log('Default NYC, city search, accented names, keyboard access, city isolation and unknown-city 404 passed.');
}finally{await browser.close();}
