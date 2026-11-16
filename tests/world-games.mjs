import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const flags=JSON.parse(fs.readFileSync(new URL('../dist/games/data/flags.json',import.meta.url)));
const languages=JSON.parse(fs.readFileSync(new URL('../dist/games/data/languages.json',import.meta.url)));
const vocabulary=JSON.parse(fs.readFileSync(new URL('../dist/games/data/vocabulary.json',import.meta.url)));
const browser=await chromium.launch();
try{
 for(const kind of ['flags','languages','vocabulary'])for(const width of [390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:844}}),otherCtx=await browser.newContext({viewport:{width,height:844}});
  const page=await ctx.newPage(),other=await otherCtx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await Promise.all([page.clock.install({time:new Date('2026-11-14T16:00:00Z')}),other.clock.install({time:new Date('2026-11-14T16:00:00Z')})]);
  await Promise.all([page.goto(`${base}/${kind}/`),other.goto(`${base}/${kind}/`)]);await Promise.all([page.locator('.choice').first().waitFor(),other.locator('.choice').first().waitFor()]);
  if(kind==='vocabulary'){
   for(const route of ['/','/flags/','/languages/']){
    await other.goto(base+route);
    await other.getByRole('link',{name:'Vocabulary',exact:true}).click();
    await other.locator('.vocabulary-word').waitFor();
    assert.equal(await other.getByRole('link',{name:'Vocabulary',exact:true}).getAttribute('aria-current'),'page');
   }
  }
  const content=async p=>kind==='flags'?await p.locator('.flag').getAttribute('src'):await p.locator(kind==='vocabulary'?'.vocabulary-word':'.sample').innerText();
  const answer=async p=>{if(kind==='flags'){const src=await content(p),id=decodeURIComponent(src.split('/').at(-1).replace('.svg',''));return flags.find(x=>x.id===id).name;}const text=await content(p);return kind==='vocabulary'?vocabulary.find(x=>x.id===text).name:languages.find(x=>x.samples.includes(text)).name;};
  const dots=page.locator('.daily-progress .progress-dot');
  const prompts=[];
  for(let i=0;i<5;i++){
   assert.equal(await dots.count(),5);assert.equal(await dots.nth(i).getAttribute('aria-label'),`Question ${i+1}: current`);
   assert.equal(await page.locator('.choice').count(),4);const prompt=await content(page);assert.equal(await content(other),prompt);prompts.push(prompt);
   const name=await answer(page),options=await page.locator('.choice').allTextContents();assert.equal(new Set(options).size,4);assert.ok(options.includes(name));
   if(kind==='vocabulary'){
    const item=vocabulary.find(x=>x.id===prompt);
    assert.deepEqual(new Set(options),new Set([item.name,...item.distractors]));
    assert.equal(await page.locator('.example').count(),0);
   }
   const pick=i%2===0?name:options.find(x=>x!==name);if(i===0){await page.getByRole('button',{name:pick,exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#next').evaluate(n=>n===document.activeElement),true);}else await page.getByRole('button',{name:pick,exact:true}).click();
   assert.match(await page.locator('.feedback').innerText(),i%2===0?/Correct!/:new RegExp('Correct answer:'));
   assert.equal(await dots.nth(i).getAttribute('aria-label'),`Question ${i+1}: ${i%2===0?'correct':'incorrect'}`);
   assert.equal(await dots.nth(i).innerText(),i%2===0?'✓':'×');
   assert.equal(await page.locator('.choice:disabled').count(),4);await page.reload();await page.locator('#next').waitFor({state:'visible'});
   assert.match(await page.locator('.feedback').innerText(),i%2===0?/Correct!/:/Correct answer:/);
   assert.equal(await dots.nth(i).getAttribute('aria-label'),`Question ${i+1}: ${i%2===0?'correct':'incorrect'}`);
   if(i%2!==0){
    assert.equal(await page.locator('.selected-answer').innerText(),`Your answer: ${pick}`);
    assert.equal(await page.locator('#next').getAttribute('aria-describedby'),'answer-feedback');
   }
   if(kind==='vocabulary')assert.equal(await page.locator('.example').innerText(),vocabulary.find(x=>x.id===prompt).example);
   await other.getByRole('button',{name:await answer(other),exact:true}).click();await Promise.all([page.locator('#next').click(),other.locator('#next').click()]);
  }
  assert.equal(new Set(prompts).size,5);assert.equal(await page.locator('.result h2').innerText(),'3 out of 5');assert.deepEqual(await dots.allTextContents(),['✓','×','✓','×','✓']);
  await page.reload();assert.equal(await page.locator('.result h2').innerText(),'3 out of 5');
  await page.getByRole('button',{name:'Play practice'}).click();assert.equal(await dots.count(),0);const practicePrompts=[];
  for(let i=0;i<10;i++){
   const prompt=await content(page);practicePrompts.push(prompt);const name=await answer(page);await page.getByRole('button',{name,exact:true}).click();assert.match(await page.locator('.feedback').innerText(),/^Correct!/);await page.locator('#next').click();assert.equal(await page.locator('#question-title').evaluate(n=>n===document.activeElement),true);
  }
  assert.equal(new Set(practicePrompts).size,10);assert.match(await page.locator('.round-head').innerText(),/10 correct/);
  await page.reload();await page.locator('.choice').first().waitFor();assert.equal(await page.locator('#practice').getAttribute('aria-pressed'),'true');assert.match(await page.locator('.round-head').innerText(),/10 correct/);
  await page.locator('#daily').click();assert.equal(await page.locator('.result h2').innerText(),'3 out of 5');
  await page.clock.setFixedTime(new Date('2026-11-15T16:00:00Z'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.match(await page.locator('.round-head').innerText(),/Question 1 of 5/);assert.equal(await dots.nth(0).getAttribute('aria-label'),'Question 1: current');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await ctx.close();await otherCtx.close();console.log(`${kind} ${width}px: five daily questions, results, reload, next day, and ten practice rounds passed`);
 }
 const exhaustive=await browser.newPage({viewport:{width:320,height:844}});await exhaustive.goto(`${base}/flags/`);await exhaustive.locator('#practice').click();const seen=new Set();let previous;
 for(let i=0;i<flags.length+1;i++){
  const src=await exhaustive.locator('.flag').getAttribute('src'),id=decodeURIComponent(src.split('/').at(-1).replace('.svg',''));
  if(i<flags.length){assert.ok(!seen.has(id),`Repeated ${id} before the deck ended`);seen.add(id);}else assert.notEqual(id,previous,'The next deck should not repeat the last flag');
  previous=id;const correct=flags.find(f=>f.id===id).name;await exhaustive.getByRole('button',{name:correct,exact:true}).click();await exhaustive.locator('#next').click();
 }
 assert.equal(seen.size,flags.length);assert.equal(await exhaustive.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log('Practice covers every flag before repeating');await exhaustive.close();
 const imagePage=await browser.newPage();await imagePage.goto(`${base}/flags/`);const missing=await imagePage.evaluate(async ids=>{const failed=[];for(const id of ids){const img=new Image();img.src=`/games/flags/${id}.svg`;try{await img.decode();if(!img.naturalWidth||!img.naturalHeight)failed.push(id);}catch{failed.push(id);}}return failed;},flags.map(f=>f.id));assert.deepEqual(missing,[]);console.log(`All ${flags.length} flag images load`);await imagePage.close();
}finally{await browser.close();}
