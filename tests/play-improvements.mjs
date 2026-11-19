import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {prepareVisual,visualSet} from '../dist/games/visual-puzzles.js';
import {prepareExtra,extraPuzzle} from '../dist/games/extra-puzzles.js';
import {makeSet,preparePuzzles} from '../dist/games/rot-puzzles.js';
import {createRouter} from '../dist/router.js';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const read=async name=>JSON.parse(await fs.readFile(new URL(`../dist/${name}`,import.meta.url),'utf8'));
const day='2026-11-17';
const browser=await chromium.launch();
await fs.mkdir(new URL('../test-results/play-improvements/',import.meta.url),{recursive:true});
const screenshot=(page,name)=>page.screenshot({path:new URL(`../test-results/play-improvements/${name}.png`,import.meta.url).pathname,fullPage:true});
try {
 for(const width of [320,390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/api/daily-score',r=>r.fulfill({status:404}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(`${day}T16:00:00Z`));
  const fits=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}px`);
  await page.goto(`${base}/borderrot/`);await page.getByRole('searchbox').fill('Congo');
  assert.deepEqual(new Set(await page.locator('.rot-choices button').allTextContents()),new Set(['DR Congo','Republic of the Congo']));
  await page.getByRole('searchbox').fill('DRC');assert.equal(await page.locator('.rot-choices button').textContent(),'DR Congo');
  await page.getByRole('searchbox').fill('Ivory Coast');assert.equal(await page.locator('.rot-choices button').count(),1);
  await fits();await screenshot(page,`country-search-${width}`);

  const ladderRows=Array.from({length:5},()=>['soup','stew']);
  await page.route('**/games/data/ladderrot.json',r=>r.fulfill({json:ladderRows}));
  await page.goto(`${base}/ladderrot/`);await page.locator('#extra-title').waitFor();
  const puzzle=extraPuzzle('ladderrot',prepareExtra('ladderrot',ladderRows,await read('games/data/ladder-words.json')),day);
  await page.getByLabel('Next word').fill(puzzle.solution[1]);await page.getByRole('button',{name:'Add word',exact:true}).click();
  await page.getByRole('button',{name:'Undo last word',exact:true}).click();
  assert.equal(await page.locator('.ladder-chain li').count(),1);
  await page.reload();await page.locator('#extra-title').waitFor();assert.equal(await page.locator('.ladder-chain li').count(),1);
  for(const word of ['sour','pour','poor','boor','book','boot','soot','slot','slop','stop','step','stew']){await page.getByLabel('Next word').fill(word);await page.getByRole('button',{name:'Add word',exact:true}).click();}
  assert.match(await page.locator('#extra-title').innerText(),/12 moves/);
  assert.match(await page.locator('#quiz').innerText(),/Fewest possible moves: 5/);
  await page.locator('.solution-review summary').press('Enter');
  assert.deepEqual(await page.getByRole('list',{name:'Shortest solution',exact:true}).locator('li').allTextContents(),puzzle.solution.map(w=>w.toUpperCase()));
  assert.equal(await page.getByRole('button',{name:'Undo last word',exact:true}).count(),0);
  await page.reload();await page.locator('.solution-review summary').click();await fits();await screenshot(page,`ladder-solution-${width}`);

  for(const game of ['skyrot','zoomrot','skylinerot']) {
   await page.goto(`${base}/${game}/`);await page.locator('#question-title').waitFor();
   assert.equal(await page.getByLabel('Difficulty',{exact:true}).isVisible(),false);
   const daily=await page.locator('#question-title').innerText();
   await page.getByRole('button',{name:'Practice',exact:true}).click();
   assert.equal(await page.getByLabel('Difficulty',{exact:true}).inputValue(),'standard');
   if(game!=='skylinerot') {
    assert.match(await page.locator('.visual-hint').innerText(),/100 → 65 points/);
    await page.locator('.visual-hint').click();assert.match(await page.locator('.visual-hint').innerText(),/65 → 35 points/);
   }
   await page.getByLabel('Difficulty',{exact:true}).selectOption('hard');
   await page.locator('#quiz img').evaluate(img=>img.decode());
   const seed=await page.evaluate(game=>JSON.parse(localStorage.getItem(`dailyo:${game}:v1:practice:hard`)).seed,game);
   const questions=visualSet(game,prepareVisual(game,await read(`games/data/${game}.json`)),seed,false,0,'hard');
   assert.deepEqual(new Set(await page.locator('.visual-choice').allTextContents()),new Set(questions[0].options.map(q=>q.name)));
   assert.match(await page.locator('.visual-hint').innerText(),/100 → 65 points/);
   assert.ok(await page.locator('#quiz img').evaluate(img=>Number(getComputedStyle(img).transform.match(/matrix\(([^,]+)/)[1])>1));
   await fits();await screenshot(page,`${game}-hard-${width}`);
   await page.locator('.visual-hint').click();
   await page.getByRole('button',{name:questions[0].item.name,exact:true}).click();
   assert.match(await page.locator('#visual-feedback').textContent(),/65 \/ 100 points/);
   await page.reload();await page.locator('#question-title').waitFor();
   assert.equal(await page.getByLabel('Difficulty',{exact:true}).inputValue(),'hard');
   assert.match(await page.locator('.game-progress').innerText(),/2 of 5/);
   const hardHeading=await page.locator('#quiz').innerText();
   await page.getByLabel('Difficulty',{exact:true}).selectOption('easy');
   assert.match(await page.locator('.game-progress').innerText(),/1 of 5/);
   await page.getByLabel('Difficulty',{exact:true}).selectOption('hard');
   assert.equal(await page.locator('#quiz').innerText(),hardHeading);
   await page.getByRole('button',{name:'Daily',exact:true}).click();
   assert.equal(await page.locator('#question-title').innerText(),daily);
   assert.equal(await page.getByLabel('Difficulty',{exact:true}).isVisible(),false);
  }

  await page.goto(`${base}/yearrot/`);await page.locator('#round-title').waitFor();
  const dailyTimeline=await page.locator('#quiz').innerText();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await page.getByLabel('Difficulty',{exact:true}).selectOption('hard');
  const seed=await page.evaluate(()=>JSON.parse(localStorage.getItem('dailyo:yearrot:v1:practice:hard')).seed);
  const questions=makeSet('yearrot',preparePuzzles('yearrot',await read('games/data/yearrot.json')),seed,0,'hard');
  const slot=questions[0].timeline.filter(([year])=>year<questions[0].event[0]).length;
  await page.locator('.rot-slot').nth(slot).click();await page.getByRole('button',{name:'Next question',exact:true}).click();
  const hardTimeline=await page.locator('#quiz').innerText();
  await page.getByLabel('Difficulty',{exact:true}).selectOption('easy');
  await page.getByLabel('Difficulty',{exact:true}).selectOption('hard');assert.equal(await page.locator('#quiz').innerText(),hardTimeline);
  await page.reload();await page.locator('#round-title').waitFor();assert.equal(await page.locator('#quiz').innerText(),hardTimeline);
  await fits();await screenshot(page,`timeline-hard-${width}`);
  await page.getByRole('button',{name:'Daily',exact:true}).click();assert.equal(await page.locator('#quiz').innerText(),dailyTimeline);

  const network=await read('data/network.json'),challenges=await read('data/challenges.json'),router=createRouter(network);
  let tie;
  for(const challenge of challenges){const best=router.best(challenge.from,challenge.to);for(let i=0;i<best.legs.length;i++){for(const route of Object.keys(network.routes)){const draft=best.legs.map(l=>({route:l.route}));draft[i]={route};const result=router.assess(challenge.from,challenge.to,draft);if(result.valid&&result.seconds===best.seconds&&result.legs.map(l=>l.route).join()!==best.legs.map(l=>l.route).join()){tie={challenge,draft,result};break;}}if(tie)break;}if(tie)break;}
  assert.ok(tie,'demo deck has an equally fast alternative');
  await page.route('**/data/challenges.json',r=>r.fulfill({json:[tie.challenge]}));
  await page.goto(`${base}/trainrot/`);await page.locator('[data-route]').first().waitFor();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  for(const {route} of tie.draft)await page.getByRole('button',{name:`Add ${route} train`,exact:true}).click();
  await page.getByRole('button',{name:'Check route',exact:true}).click();await page.locator('#next').waitFor();
  assert.match(await page.locator('.primary-itinerary h3').innerText(),/^Your route/);
  assert.deepEqual(await page.locator('.primary-itinerary .train-badge').allTextContents(),tie.result.legs.map(l=>l.route));
  assert.match(await page.locator('.result-subtitle').innerText(),/ties the fastest time/);
  await page.locator('.route-details summary').click();assert.match(await page.locator('.alternative-itinerary h3').innerText(),/Another fastest route/);
  await page.reload();await page.locator('#next').waitFor();assert.deepEqual(await page.locator('.primary-itinerary .train-badge').allTextContents(),tie.result.legs.map(l=>l.route));
  await fits();await screenshot(page,`train-tie-${width}`);
  assert.deepEqual(errors,[]);await context.close();
  console.log(`${width}px: aliases, ladder undo + review, photo hints + difficulty saves, close timeline anchors, tied subway itineraries passed`);
 }
}finally{await browser.close();}
