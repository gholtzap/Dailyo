import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {prepareVisual,visualSet} from '../dist/games/visual-puzzles.js';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url)));
const browser=await chromium.launch(),reports=[],lint=process.argv.includes('--ui');
await fs.mkdir('test-results/interaction-polish',{recursive:true});
try{
 for(const viewport of policy.viewports){
  const page=await browser.newPage({viewport,colorScheme:'dark'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-20T16:00:00Z'));
  const inspect=async(name)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/interaction-polish/${viewport.width}-${name}.png`});if(lint)reports.push({viewport,name,...await checkPage(page,policy)});};
  await page.goto(`${base}/orderrot/`);await page.locator('.visual-order').waitFor();
  const data=prepareVisual('orderrot',await (await page.request.get(`${base}/games/data/orderrot.json`)).json());
  const q=visualSet('orderrot',data,'2026-11-20')[0],reverse=[...q.tiles].sort((a,b)=>b.value-a.value);
  for(const [position,tile] of reverse.entries())while(await page.locator('.visual-order li').nth(position).locator('span').innerText()!==tile.name)await page.getByRole('button',{name:`Move ${tile.name} up`,exact:true}).click();
  const submitted=await page.locator('.visual-order li > span').allTextContents();
  await page.getByRole('button',{name:'Check order',exact:true}).click();
  await page.getByRole('list',{name:'Your order',exact:true}).waitFor({timeout:3000});
  assert.deepEqual(await page.getByRole('list',{name:'Your order',exact:true}).locator('li').allTextContents(),submitted);
  assert.deepEqual((await page.getByRole('list',{name:'Correct order',exact:true}).locator('li').allTextContents()).map(t=>t.split(' — ')[0]),[...reverse].reverse().map(t=>t.name));
  assert.match(await page.locator('#visual-feedback').innerText(),/^0 \/ 100/,'Scoring is unchanged');
  await inspect('order-comparison');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.locator('.visual-order').waitFor();

  for(const game of ['anglerot','splitrot']){
    await page.goto(`${base}/${game}/`);
    await page.getByRole('button',{name:'Start round',exact:true}).waitFor();
    await page.getByRole('button',{name:'Practice',exact:true}).click();
    await page.getByRole('slider').waitFor();
    assert.equal(await page.getByRole('button',{name:'Start round',exact:true}).count(),0);
    await inspect(`${game}-practice`);
    await page.getByRole('slider').fill('42.5');
    await page.getByRole('button',{name:game==='anglerot'?'Check angle':'Check split',exact:true}).click();
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByRole('slider').waitFor();
    assert.equal(await page.getByRole('button',{name:'Start round',exact:true}).count(),0);
    await page.reload();await page.getByRole('button',{name:'Start round',exact:true}).waitFor();
    await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('slider').waitFor();
    await page.getByLabel('Practice variation').selectOption('hard');
    await page.getByRole('slider').waitFor();
    await page.getByRole('button',{name:'Daily',exact:true}).click();
    await page.getByRole('button',{name:'Start round',exact:true}).waitFor();
  }
  for(const game of ['countrot','trackrot','temporot']){
    await page.goto(`${base}/${game}/?practice=1`);
    await page.getByRole('button',{name:'Start round',exact:true}).waitFor();
    assert.equal(await page.getByRole('slider').count(),0,'Playback still waits for explicit readiness');
  }
  assert.deepEqual(errors,[]);await page.close();
  console.log(`${viewport.width}px: submitted/correct orders, unchanged scoring, consistent Next, static practice, replay, and playback readiness`);
 }
}finally{await browser.close();await fs.writeFile('test-results/interaction-polish/ui.json',JSON.stringify(reports,null,2));}
if(reports.some(r=>r.findings.length))process.exitCode=1;
