import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {createRouter} from '../dist/router.js';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const output='test-results/ui-polish/results';await fs.mkdir(output,{recursive:true});
const policy=JSON.parse(await fs.readFile('ui-policy.json','utf8')),reports=[];
const browser=await chromium.launch();
try {
 for(const width of [390,1440]) {
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-18T16:00:00Z'));
  await page.route('**/api/daily-score',r=>r.fulfill({status:404}));
  const inspect=async name=>{
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});
   reports.push({name:`${name}-${width}`,...await checkPage(page,policy)});
  };
  for(const game of ['flags','languages','vocabulary']) {
   await page.goto(`${base}/${game}/`);await page.locator('.choice').first().waitFor();
   for(let i=0;i<5;i++){await page.locator('.choice').first().click();await page.locator('#next').click();}
   await page.locator('.answer-review details').first().waitFor();
   assert.equal(await page.locator('.answer-review details').count(),5);
   const score=await page.locator('.result h2').textContent();
   await page.locator('.answer-review summary').first().click();
   if(game==='flags')await page.locator('.review-flag').first().waitFor();
   if(game==='languages')assert.ok((await page.locator('.review-sample').first().textContent()).length>20);
   await inspect(game);
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
   await page.getByRole('button',{name:'Copy results',exact:true}).click();
   const copy=page.getByRole('textbox',{name:'Results to copy',exact:true});
   await copy.waitFor();assert.ok((await copy.inputValue()).includes(score));
   await page.reload();await page.locator('.answer-review details').first().waitFor();
   assert.equal(await page.locator('.result h2').textContent(),score);
   await page.getByRole('button',{name:'Play practice',exact:true}).click();await page.locator('.choice').first().waitFor();
  }
  await page.goto(`${base}/skyrot/`);
  for(let i=0;i<5;i++){
   await page.getByRole('button',{name:'Show answer',exact:true}).click();
   await page.getByRole('button',{name:i===4?'See results':'Next puzzle',exact:true}).click();
  }
  await page.locator('.visual-recap summary').first().waitFor();
  assert.equal(await page.locator('.visual-recap > li > details').count(),5);
  assert.equal(await page.locator('.visual-recap summary').filter({hasText:'Answer shown'}).count(),5);
  await page.locator('.visual-recap summary').first().click();
  await page.locator('.visual-recap .visual-source summary').first().click();
  assert.equal(await page.locator('[id=visual-feedback]').count(),0,'Review rows must not duplicate live feedback IDs');
  await inspect('photo-review');
  await page.goto(`${base}/trainrot/`);await page.locator('#reveal').waitFor();
  const [from,to]=await page.locator('.endpoint strong').allTextContents();
  const network=await (await page.request.get(`${base}/data/network.json`)).json();
  const challenges=await (await page.request.get(`${base}/data/challenges.json`)).json();
  const challenge=challenges.find(c=>c.fromTitle===from&&c.toTitle===to);
  assert.ok(challenge);
  const best=createRouter(network).best(challenge.from,challenge.to);
  await page.locator('.map-hint summary').click();
  await page.getByRole('button',{name:'Show subway map',exact:true}).click();
  for(const leg of best.legs)await page.locator(`button[data-route="${leg.route}"]`).click();
  await page.locator('#reveal').click();
  await page.locator('.result-score').filter({hasText:'Completed with map'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Play practice',exact:true}).getAttribute('class'),'primary-button');
  await inspect('train-assisted');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Phone and desktop: answer review, sharing fallback, saved scores, practice, photo sources, and assisted Trainrot verdict passed.');
} finally {await browser.close();await fs.writeFile(`${output}/ui.json`,JSON.stringify(reports,null,2));}
const findings=reports.flatMap(r=>r.findings);console.log(`${findings.length} Lintapple findings; see ${output}/ui.json.`);
if(process.argv.includes('--ui')&&findings.length)process.exitCode=1;
