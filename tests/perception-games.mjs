import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {perceptionGames,perceptionPuzzle} from '../dist/games/perception-puzzles.js';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173',day='2026-11-19';
const lint=process.argv.includes('--ui');
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url)));
const browser=await chromium.launch(),reports=[],receipt=[];
const errors=[];
await fs.mkdir('test-results/perception',{recursive:true});
async function setRange(page,value){await page.locator('input[type=range]').fill(String(Number(value.toFixed(1))));}
async function solve(page,game,q){
  if(game==='temporot')await page.clock.pauseAt(await page.evaluate(()=>new Date(Date.now()+1000).toISOString()));
  await page.getByRole('button',{name:'Start round',exact:true}).press('Enter');
  if(game==='countrot'||game==='trackrot')await page.clock.runFor(1400);
  if(game==='countrot'){await page.getByLabel('How many dots?').fill(String(q.target));await page.getByRole('button',{name:'Check estimate',exact:true}).click();}
  if(game==='trackrot'){await setRange(page,q.target*100);await page.getByRole('button',{name:'Check landing',exact:true}).click();}
  if(game==='anglerot'){await setRange(page,q.target);await page.getByRole('button',{name:'Check angle',exact:true}).click();}
  if(game==='splitrot'){await setRange(page,(q.right?1-q.target:q.target)*100);await page.getByRole('button',{name:'Check split',exact:true}).click();}
  if(game==='temporot'){
    // Audio starts 150 ms after the user gesture; clock steps exercise the real tap path.
    await page.getByText('Listen to the four reference beats…',{exact:true}).waitFor();
    await page.clock.runFor(150+(q.hard?3.5:4)*q.interval);
    for(let i=0;i<8;i++){if(i)await page.clock.runFor(q.interval);await page.getByRole('button',{name:'Tap',exact:true}).press('Space');}
  }
  await page.locator('#perception-feedback').waitFor();
  if(game==='temporot')await page.clock.resume();
  const points=Number((await page.locator('#perception-feedback').innerText()).split(' ')[0]);
  assert.ok(points>=(game==='temporot'?98:100),`${game}: expected accurate input, received ${points}`);
  return points;
}
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme:'dark',permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(`${day}T16:00:00Z`)});
  const inspect=async(game,state)=>{if(lint){const report=await checkPage(page,policy);reports.push({game,width,state,...report});}assert.ok(await page.locator('body').evaluate(n=>n.scrollWidth<=innerWidth),'horizontal overflow');};
  for(const game of perceptionGames){
    await page.goto(`${base}/${game}/`);await page.getByRole('button',{name:'Start round'}).waitFor();await inspect(game,'ready');
    await page.getByRole('button',{name:'How to play',exact:true}).click();await inspect(game,'help');await page.getByRole('button',{name:'Close',exact:true}).click();
    let total=0;
    for(let i=0;i<5;i++){
      total+=await solve(page,game,perceptionPuzzle(game,day,i));
      if(i===0){await inspect(game,'feedback');await page.reload();}
      else await page.getByRole('button',{name:i===4?'See results':'Next round',exact:true}).click();
    }
    await page.getByRole('heading',{name:`${total} / 500 points`,exact:true}).waitFor();await inspect(game,'results');
    await page.getByRole('button',{name:'Copy results',exact:true}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),new RegExp(`${game} ${day}`));
    await page.reload();await page.getByRole('heading',{name:`${total} / 500 points`,exact:true}).waitFor();
    await page.getByRole('button',{name:'Play practice',exact:true}).click();await page.getByLabel('Practice variation').selectOption('hard');await inspect(game,'hard-ready');
    const seed=await page.evaluate(game=>JSON.parse(localStorage.getItem(`dailyo:${game}:v1:practice:hard`)??'null')?.seed,game);
    // Starting fresh practice saves its seed before the first round for repeatable replay.
    await page.getByRole('button',{name:'Start round',exact:true}).click();
    if(game==='countrot'||game==='trackrot')await page.clock.runFor(1400);
    if(game==='temporot')await page.clock.runFor(3000);
    await inspect(game,'hard-answer');
    if(game==='anglerot'){await page.locator('input').focus();await page.keyboard.press('ArrowRight');assert.ok(Number(await page.locator('input').inputValue())>0);}
    await page.screenshot({path:`test-results/perception/${game}-${width}.png`});
    await page.getByRole('button',{name:'Skip round',exact:true}).click();await inspect(game,'skipped');
    await page.getByRole('button',{name:'Next round',exact:true}).click();
    await solve(page,game,perceptionPuzzle(game,seed,1,true));
    await page.getByRole('button',{name:'Daily',exact:true}).click();await page.getByRole('heading',{name:`${total} / 500 points`,exact:true}).waitFor();
    receipt.push(`${width}px ${game}: five accurate rounds, reload/resume, sharing, hard practice, skip, daily preservation`);
  }
  // Real daily host consumes the completed sets and includes all five in its recap.
  await page.goto(`${base}/daily/`);
  for(let i=0;i<16;i++){await page.getByRole('button',{name:'Skip game',exact:true}).click();}
  await page.getByRole('heading',{name:'Daily recap',exact:true}).waitFor();assert.equal(await page.locator('#feed-results li').count(),21);
  for(const game of perceptionGames)assert.match(await page.locator('#feed-results li').filter({hasText:game}).innerText(),/\d+ \/ 500 points/);
  await context.close();
 }
 // Rush readiness, correct answer, and timeout travel through the parent iframe contract.
 const page=await browser.newPage();await page.clock.install({time:new Date(`${day}T16:00:00Z`)});
 for(const game of perceptionGames){
   await page.goto(`${base}/rush/${game}/?date=${day}`);
   await page.locator('#rush-status').filter({hasText:'Round 1'}).waitFor();
   const frame=page.frames().find(f=>f.url().includes(`/${game}/?rush=0`));
   const q=perceptionPuzzle(game,`rush:${game}:${day}`,0);
   // Use the page's clock for the frame's actual timers.
   frame.clock=page.clock;await solve(frame,game,q);
   await page.locator('#rush-status').filter({hasText:'Round 2'}).waitFor();
   const second=page.frames().find(f=>f.url().includes(`/${game}/?rush=1`));
   await second.getByRole('button',{name:'Start round',exact:true}).click();
   await page.getByRole('button',{name:'Pause',exact:true}).click();
   await page.clock.runFor(30000);
   assert.equal(await second.locator('#perception-feedback').count(),0,'Paused playback must not score or time out');
   await page.getByRole('button',{name:'Resume',exact:true}).click();
   await page.clock.runFor(30000);
   await page.getByRole('button',{name:'See recap',exact:true}).click();await page.getByRole('heading',{name:'Rush recap',exact:true}).waitFor();
   receipt.push(`${game}: Rush ready, correct, pause/resume, timeout, recap`);
 }
 assert.deepEqual(errors,[]);
}finally{
 if(lint)await fs.writeFile('test-results/perception/ui.json',JSON.stringify(reports,null,2));
 await fs.writeFile('test-results/perception/receipt.txt',receipt.join('\n')+'\n');await browser.close();
}
console.log(receipt.join('\n'));
const findings=reports.flatMap(r=>r.findings.map(f=>({game:r.game,width:r.width,state:r.state,...f})));
if(findings.length){console.log(JSON.stringify(findings,null,2));process.exitCode=1;}
