import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const policy=JSON.parse(await fs.readFile('ui-policy.json','utf8'));
const stage=process.argv[2]??'navigation';
const output=`test-results/ui-polish/${stage}`;
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch(),reports=[];
async function inspect(page,name){
 try{reports.push({name,...await checkPage(page,policy)});}
 catch(error){
  if(!String(error).includes('5000 element limit'))throw error;
  reports.push({name,incomplete:String(error)});
 }
}
try {
 for(const width of [320,390,1440]) {
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/daily-score',r=>r.fulfill({status:404}));
  for(const route of ['/','/daily/','/trainrot/','/zoomrot/','/trainrot-world/london/']) {
   await page.goto(base+route);
   await page.locator('.site-masthead .site-more summary').waitFor();
   if(route==='/trainrot/'||route.startsWith('/trainrot-world/'))await page.locator('#reveal').waitFor();
   else if(route==='/zoomrot/')await page.locator('#question-title').waitFor();
   else await page.locator('iframe:not(.feed-loading)').waitFor();
   if(stage!=='navigation'&&stage!=='hierarchy'&&route==='/') {
    const status=await page.locator('.feed-actions').boundingBox();
    const puzzle=await page.locator('#feed-game').boundingBox();
    assert.ok(status.y+status.height<=puzzle.y+1,'Rush status belongs directly above the puzzle');
    if(width===1440){const main=await page.frameLocator('iframe:not(.feed-loading)').locator('.main').boundingBox();assert.ok(Math.abs(main.x-status.x)<=1,'Rush puzzle and status share a left edge');}
   }
   if(route==='/zoomrot/'){
    assert.equal(await page.locator('.heading .game-progress').textContent(),'1 of 5');
    assert.equal(await page.locator('#question-title').getAttribute('class'),'visually-hidden');
   }
   const header=page.locator('.site-masthead');
   const dailyLink=header.getByRole('link',{name:'Daily mix',exact:true});
   await dailyLink.waitFor();
   assert.equal(await dailyLink.textContent(),'Daily mix');
   if(route==='/daily/')assert.equal(await dailyLink.getAttribute('aria-current'),'page');
   if(route==='/zoomrot/')assert.equal(await page.locator('#daily').getAttribute('aria-pressed'),'true');
   await header.getByRole('link',{name:'Rush',exact:true}).waitFor();
   assert.equal(await header.locator('.site-github').count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   const summary=header.locator('summary');await summary.press('Enter');
   const menu=header.getByRole('navigation',{name:'Games',exact:true});
   await menu.getByRole('link',{name:'GitHub repository',exact:true}).waitFor();
   assert.equal(await menu.locator('.game-picker-context').textContent(),route==='/'?'Play in Rush':'Daily & practice');
   const vocabulary=menu.getByRole('link',{name:/^Vocabulary Word meanings$/});
   assert.equal(await vocabulary.locator('small').textContent(),'Word meanings');
   assert.equal(await vocabulary.getAttribute('href'),route==='/'?'/rush/vocabulary/':'/vocabulary/');
   assert.ok((await menu.boundingBox()).x>=0);
   await inspect(page,`${route}-${width}-menu`);
   await page.keyboard.press('Escape');assert.equal(await header.locator('details').getAttribute('open'),null);
   assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
   await summary.click();await header.click({position:{x:4,y:4}});
   assert.equal(await header.locator('details').getAttribute('open'),null);
   if(route==='/'){
    await summary.click();
    await page.frameLocator('iframe:not(.feed-loading)').locator('.prompt').click({position:{x:8,y:8}});
    assert.equal(await header.locator('details').getAttribute('open'),null,'Clicking inside an embedded game closes the menu');
   }
   const name=route.replaceAll('/','')||'rush';
   await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});
   await inspect(page,`${route}-${width}-page`);
  }
  assert.deepEqual(errors,[]);await page.close();
 }
} finally {await browser.close();await fs.writeFile(`${output}/ui.json`,JSON.stringify(reports,null,2));}
const findings=reports.flatMap(r=>r.findings??[]);
console.log(`${stage}: navigation behavior passed; ${reports.length} UI states inspected; ${findings.length} policy findings; ${reports.filter(r=>r.incomplete).length} incomplete checks (see ${output}/ui.json).`);

if(process.argv.includes('--ui'))process.exitCode=reports.some(r=>r.incomplete)?2:findings.length?1:0;
