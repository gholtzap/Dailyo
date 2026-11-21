import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {prepareVisual,visualSet} from '../dist/games/visual-puzzles.js';
import {preparePuzzles,makeSet} from '../dist/games/rot-puzzles.js';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const ui=process.argv.includes('--ui'),day='2026-11-18';
const read=async name=>JSON.parse(await fs.readFile(new URL(`../dist/games/data/${name}.json`,import.meta.url),'utf8'));
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url),'utf8'));
const phase=process.env.PLAY_REVIEW_PHASE??'after';
const output=new URL(`../test-results/second-playtest/${phase}/`,import.meta.url);await fs.mkdir(output,{recursive:true});
const results=[],uiReports=[],browser=await chromium.launch();
async function check(name,action){try{await action();results.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){results.push({name,passed:false,error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
async function inspect(page,name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:new URL(`${name}.png`,output).pathname,fullPage:true});if(ui){await page.evaluate(()=>scrollTo(0,0));const report=await checkPage(page,policy);uiReports.push({name,...report});}}
const orderRows=Array.from({length:5},(_,i)=>({id:`measure-${i}`,name:i===4?'Space missions by launch year':'SI prefixes',source:'https://example.test/fixture',unit:i===4?'CE':'multiplier',items:i===4?[{id:'sputnik',name:'Sputnik',value:1957},{id:'apollo',name:'Apollo',value:1969},{id:'hubble',name:'Hubble',value:1990},{id:'voyager',name:'Voyager',value:1977}]:[{id:'micro',name:'micro',value:.000001},{id:'milli',name:'milli',value:.001},{id:'kilo',name:'kilo',value:1000},{id:'mega',name:'mega',value:1000000}]}));
const ladderPaths={
 'LIKE to LOVE':['live','love'],'COLD to WARM':['cord','card','ward','warm'],
 'MILK to WINE':['mile','mine','wine'],'HEAD to TAIL':['heal','heil','hail','tail'],'TALL to THIN':['tail','tain','thin'],
};
try {
 for(const {width,height} of [...policy.viewports,{width:390,height:600}]){
  const sizeName=`${width}x${height}`;
  const context=await browser.newContext({viewport:{width,height},colorScheme:'dark',reducedMotion:'reduce'});
  await context.route('**/api/daily-score',r=>r.fulfill({status:404}));
  const page=await context.newPage();page.setDefaultTimeout(5000);await page.clock.setFixedTime(new Date(`${day}T16:00:00Z`));
  for(const game of ['skyrot','zoomrot','skylinerot'])await check(`${sizeName} ${game} wrong-guess recovery`,async()=>{
   await page.goto(`${base}/${game}/`);await page.locator('#question-title').waitFor();
   const q=visualSet(game,prepareVisual(game,await read(game)),day)[0];
   await page.getByRole('button',{name:q.options.find(o=>o.id!==q.item.id).name,exact:true}).click();
   const image=await page.locator('.visual-viewport').boundingBox();assert.ok(image.y>=-1&&image.y+image.height<= height,'The widened image must remain fully visible');
   await page.keyboard.press('Tab');
   assert.ok(await page.locator('.visual-choice:enabled').first().evaluate(node=>node===document.activeElement),'Tab after feedback must reach the remaining answers');
   await inspect(page,`photo-recovery-${game}-${sizeName}`);
   await page.getByRole('button',{name:q.item.name,exact:true}).click();await page.locator('.visual-reveal').waitFor();await inspect(page,`photo-result-${game}-${sizeName}`);
  });
  await check(`${sizeName} ordering focus and precise values`,async()=>{
   await page.route('**/games/data/orderrot.json',r=>r.fulfill({json:orderRows}));
   await page.goto(`${base}/orderrot/`);await page.locator('#question-title').waitFor();
   const first=(await page.locator('.visual-order li span').allTextContents())[0];
   await page.getByRole('button',{name:`Move ${first} down`,exact:true}).click();await page.getByRole('button',{name:`Move ${first} up`,exact:true}).click();
   await inspect(page,`ordering-focus-${sizeName}`);
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),`Move ${first} down`,'Keep focus on the moved item at the top edge');
   const questions=visualSet('orderrot',prepareVisual('orderrot',orderRows),day);
   for(const [index,q] of questions.entries()){
    for(const [position,item] of [...q.tiles].sort((a,b)=>a.value-b.value).entries())while((await page.locator('.visual-order li span').allTextContents()).indexOf(item.name)>position)await page.getByRole('button',{name:`Move ${item.name} up`,exact:true}).click();
    await inspect(page,`ordering-${sizeName}-${index}`);await page.getByRole('button',{name:'Check order',exact:true}).click();
    const text=await page.locator('.visual-solution').innerText();
    if(q.item.unit==='CE'){assert.match(text,/1957 CE/);assert.doesNotMatch(text,/1,957/);}else assert.match(text,/micro — 0\.000001 multiplier/);
    await inspect(page,`precise-values-${sizeName}-${index}`);
    await page.getByRole('button',{name:index===4?'See results':'Next',exact:true}).click();
   }
  });
  for(const game of ['maprot','yearrot','borderrot'])await check(`${sizeName} ${game} completed question review`,async()=>{
   await page.goto(`${base}/${game}/`);await page.locator('#round-title').waitFor();
   const data=preparePuzzles(game,await read(game)),questions=makeSet(game,data,day);
   for(const [index,q] of questions.entries()){
    if(game==='maprot'){
     const point=await page.locator('svg.rot-map').evaluate((map,[lon,lat])=>{const p=new DOMPoint(lon+180,90-lat).matrixTransform(map.getScreenCTM());return{x:p.x,y:p.y};},q.slice(2));
     await page.mouse.click(point.x,point.y);await page.getByRole('button',{name:'Check pin',exact:true}).click();
    }else if(game==='yearrot'){const slot=q.timeline.filter(([year])=>year<q.event[0]).length;await page.locator('.rot-slot').nth(index===1?(slot+1)%(q.timeline.length+1):slot).click();}
    else if(index===4)await page.getByRole('button',{name:'Show shortest route',exact:true}).click();
    else for(const id of q.slice(1)){const name=data.graph.get(id).name;await page.getByRole('searchbox').fill(name);await page.getByRole('button',{name,exact:true}).click();}
    await page.getByRole('button',{name:index===4?'See results':'Next',exact:true}).click();
   }
   await inspect(page,`recap-summary-${game}-${sizeName}`);
   assert.equal(await page.locator('.rot-recap details').count(),5,'Every completed question needs a review');
   const score=await page.locator('#round-title').innerText();
   if(game==='yearrot')assert.match(await page.locator('.rot-recap details').nth(1).innerText(),/Missed/);
   if(game==='borderrot')assert.match(await page.locator('.rot-recap details').last().innerText(),/Answer shown/);
   await page.locator('.rot-recap summary').first().click();
   await page.locator('.rot-recap-detail').first().waitFor();
   const review=await page.locator('.rot-recap details').first().innerText();
   if(game==='maprot'){assert.ok(review.includes(questions[0][0]));assert.ok(review.includes(questions[0][1]));}
   if(game==='yearrot')assert.ok(review.includes(String(questions[0].event[0])));
   if(game==='borderrot')assert.ok(review.includes(data.graph.get(questions[0].at(-1)).name));
   assert.equal(await page.locator('.rot-recap .rot-next').count(),0);
   await inspect(page,`recap-${game}-${sizeName}`);await page.reload();await page.locator('.rot-recap summary').first().waitFor();
   assert.equal(await page.locator('#round-title').innerText(),score);
   await page.getByRole('button',{name:'Copy results',exact:true}).click();assert.equal(await page.locator('#round-title').innerText(),score);
  });
  await context.close();
 }
 for(const game of ['cluerot','scalerot','ladderrot'])await check(`${game} practice deck cycle and reload`,async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark'}),page=await context.newPage();page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{let nonce=0;Object.defineProperty(crypto,'randomUUID',{value:()=> '11111111-1111-4111-8111-'+String(++nonce).padStart(12,'0')});});
  const rows=game==='ladderrot'?Object.keys(ladderPaths).map(name=>name.toLowerCase().split(' to ')):game==='scalerot'?Array.from({length:5},(_,i)=>[`estimate-${i}`,`How many items in test group ${i}?`,'items',i+10,'Fixture answer.']):Array.from({length:5},(_,i)=>[`Answer ${i}`,[`answer ${i}`],Array.from({length:5},(_,j)=>`Practice clue ${i}, detail ${j}.`)]);
  await page.route(`**/games/data/${game}.json`,r=>r.fulfill({json:rows}));
  await page.goto(`${base}/${game}/?practice=1`);await page.locator('#extra-title').waitFor();
  const dailyStorage=await page.evaluate(game=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith(`dailyo:${game}:v1:daily:`))),game);
  const observed=[];
  for(let round=0;round<7;round++){
   const prompt=await page.locator('#quiz').innerText();
   if(round===3){await page.evaluate(game=>{const key=`dailyo:${game}:v1:practice`;const saved=JSON.parse(localStorage.getItem(key));saved.cycle={version:1,seen:[...(saved.cycle?.seen??[]),null,42,'unknown-puzzle']};localStorage.setItem(key,JSON.stringify(saved));},game);}
   if(round===2||round===3){await page.reload();await page.locator('#extra-title').waitFor();assert.equal(await page.locator('#quiz').innerText(),prompt,'Reload must preserve the current puzzle and deck position');}
   const identity=(game==='cluerot'?prompt.match(/Practice clue (\d+)/)[1]:await page.locator('#extra-title').innerText());observed.push(identity);
   if(round<5)assert.equal(new Set(observed).size,observed.length,'Do not repeat before the deck is exhausted');
   if(round>0)assert.notEqual(observed.at(-1),observed.at(-2),'Do not immediately repeat at a new cycle');
   if(game==='cluerot'){await page.getByLabel('Your guess').fill(`Answer ${identity}`);await page.getByRole('button',{name:'Guess',exact:true}).click();}
   else if(game==='scalerot'){const row=rows.find(row=>row[1]===identity);await page.getByRole('spinbutton').fill(String(row[3]));await page.getByRole('button',{name:'Check estimate',exact:true}).click();}
   else for(const word of ladderPaths[identity]){await page.getByLabel('Next word').fill(word);await page.getByRole('button',{name:'Add word',exact:true}).click();}
   await page.getByRole('button',{name:'New puzzle',exact:true}).click();await page.locator('#extra-title').waitFor();
  }
  assert.deepEqual(await page.evaluate(game=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith(`dailyo:${game}:v1:daily:`))),game),dailyStorage,'Practice must not change daily progress');
  await inspect(page,`practice-cycle-${game}`);results.push({game,cycle:observed});await context.close();
 });
}finally{
 await browser.close();await fs.writeFile(new URL('browser.json',output),JSON.stringify({base,day,fixtureNote:'Order values and five-puzzle practice decks are controlled fixtures. Photo and recap rounds use bundled game data.',results},null,2));
 if(ui)await fs.writeFile(new URL('ui.json',output),JSON.stringify(uiReports,null,2));
}
if(results.some(result=>result.passed===false)||uiReports.some(report=>report.findings.length))process.exitCode=1;
