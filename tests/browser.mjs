import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {createRouter} from '../dist/router.js';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const ui=process.argv.includes('--ui');
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url)));
const network=JSON.parse(await fs.readFile(new URL('../dist/data/network.json',import.meta.url)));
const challenges=JSON.parse(await fs.readFile(new URL('../dist/data/challenges.json',import.meta.url)));
const router=createRouter(network),reports=[],outcomes=[];
const output=new URL('../test-results/',import.meta.url);await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
async function inspect(page,name){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}: horizontal overflow`);
  assert.equal(await page.locator('.round-header,.shuttle-picker,#daily,#practice').count(),0,'No mode, set counter, or shuttle submenu');
  if(ui){const report=await checkPage(page,policy);reports.push({name,...report});console.log(`UI ${name}: ${report.findings.length} findings`);}
}
async function ready(page){await page.getByRole('group',{name:'Add a train',exact:true}).waitFor();}
async function current(page){
  const names=await page.locator('.endpoint strong').allTextContents();
  const c=challenges.find(c=>c.fromTitle===names[0]&&c.toTitle===names[1]);assert.ok(c);return c;
}
const add=(page,route)=>page.locator(`[data-route="${route}"]`).click();
const check=page=>page.getByRole('button',{name:'Check route',exact:true}).click();
async function puzzle(page,from,to){
  const c=challenges.find(c=>c.from===from&&c.to===to);assert.ok(c);
  await page.unroute('**/data/challenges.json');await page.route('**/data/challenges.json',route=>route.fulfill({json:[c]}));
  await page.evaluate(()=>{localStorage.clear();localStorage.setItem('trainrot-game-mode-v2','practice');});await page.reload();await ready(page);
}
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('trainrot-endless-v1:')))));
try{
  for(const size of [{width:1440,height:1000},{width:390,height:844}]){
    const context=await browser.newContext({viewport:size,isMobile:size.width<700,hasTouch:size.width<700,colorScheme:'light',reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const prefix=String(size.width);
    await page.goto(new URL('/trainrot/',base).href);
    const games=page.getByRole('navigation',{name:'Games',exact:true});
    for(const [game,path] of [['flagrot','/flags/'],['langrot','/languages/'],['trainrot','/trainrot/']]){
      await page.locator('.feed-directory summary, .site-more summary').press('Enter');
      await games.getByRole('link',{name:game,exact:true}).press('Enter');
      await page.waitForURL(url=>url.pathname===path);
      assert.equal(await page.title(),`${game} | dailyo`);
      assert.equal(await games.locator('[aria-current="page"]').textContent(),game);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await ready(page);await page.locator('#practice-mode').click();await ready(page);await inspect(page,`${prefix}-planning`);
    assert.equal(await page.getByRole('link',{name:'dailyo',exact:true}).textContent(),'dailyo');
    const original=await saved(page);
    await page.evaluate(()=>{
      const key=Object.keys(localStorage).find(k=>k.startsWith('trainrot-endless-v1:'));
      const value=JSON.parse(localStorage.getItem(key));value.state.legs=[{route:'G'}];
      localStorage.setItem(key.replace('trainrot-endless-v1:','last-stop-endless-v1:'),JSON.stringify(value));localStorage.removeItem(key);
    });
    await page.reload();await ready(page);assert.deepEqual((await saved(page)).state.legs,[{route:'G'}]);
    assert.equal(await page.locator('.train-sequence li').textContent(),'G');
    await page.getByRole('button',{name:'Undo last train',exact:true}).click();
    await page.reload();await ready(page);assert.deepEqual((await saved(page)).state.legs,[],'New saves take precedence over legacy progress');
    assert.equal((await saved(page)).seed,original.seed);assert.equal((await saved(page)).position,original.position);
    assert.equal(await page.locator('#reveal').isDisabled(),true);
    assert.equal(await page.locator('[data-route]').count(),26);
    for(const [route,suffix] of [['GS','42'],['FS','F'],['H','R']]){
      const button=page.locator(`[data-route="${route}"]`);assert.equal(await button.isVisible(),true);
      assert.equal(await button.locator('.shuttle-suffix').textContent(),suffix);
      assert.ok((await button.getAttribute('aria-label')).includes('shuttle'));
      const boxes=await button.locator('.shuttle-symbol,.shuttle-suffix').evaluateAll(ns=>ns.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
      assert.ok(boxes[1].x>boxes[0].x&&boxes[1].y>boxes[0].y,'Shuttle suffix belongs at bottom right');
      await button.click();assert.equal(await page.locator('.train-sequence .shuttle-suffix').textContent(),suffix);
      await page.getByRole('button',{name:'Undo last train',exact:true}).click();
    }
    for(const route of ['6X','7X']){
      assert.equal(await page.locator(`[data-route="${route}"]`).textContent(),route[0]);
      assert.equal(await page.locator(`[data-route="${route}"]`).getAttribute('title'),route[0]);
      assert.equal(await page.locator(`[data-route="${route}"] .express`).count(),1);
    }
    assert.doesNotMatch(await page.locator('.planner').innerText(),/Express|Practice|Daily|of 5|Unscored/);
    await page.screenshot({path:new URL(`${prefix}-planning.png`,output).pathname,fullPage:true});
    const initial=await page.locator('#city-map').getAttribute('viewBox');assert.equal(await page.locator('.map-controls').count(),0);
    await page.locator('#city-map').focus();await page.keyboard.press('+');assert.notEqual(await page.locator('#city-map').getAttribute('viewBox'),initial);
    await page.keyboard.press('Home');assert.equal(await page.locator('#city-map').getAttribute('viewBox'),initial);
    await page.keyboard.press('ArrowLeft');assert.notEqual(await page.locator('#city-map').getAttribute('viewBox'),initial);
    await page.keyboard.press('Home');
    await page.getByRole('button',{name:'How to play',exact:true}).click();await inspect(page,`${prefix}-help`);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Add 1 train',exact:true}).focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('button',{name:'Add 2 train',exact:true}).evaluate(n=>n===document.activeElement),true);
    assert.equal(await page.locator('.train-sequence li').count(),0);await page.keyboard.press('Enter');assert.equal(await page.locator('.train-sequence li').count(),1);
    await page.getByRole('button',{name:'Undo last train',exact:true}).click();
    // More than five journeys must continue, with no summary or repeated puzzle.
    const seen=new Set();
    for(let index=0;index<8;index++){
      const c=await current(page),key=c.from+':'+c.to;assert.equal(seen.has(key),false);seen.add(key);
      for(const leg of router.best(c.from,c.to).legs)await add(page,leg.route);
      if(index===0){await page.reload();await ready(page);await inspect(page,`${prefix}-draft`);}
      await check(page);assert.equal(parseInt(await page.locator('.result-score').textContent()),100);
      if(index===0){
        await inspect(page,`${prefix}-perfect-result`);assert.equal(await page.locator('.route-details').getAttribute('open'),null);
        await page.locator('.route-details summary').click();await inspect(page,`${prefix}-result-details`);
        for(const name of ['Your route','Fastest route','Compare'])await page.getByRole('button',{name,exact:true}).click();
        if(size.width<700)await page.getByRole('button',{name:'View routes on map',exact:true}).click();
        await page.reload();await page.locator('#next').waitFor();assert.equal(parseInt(await page.locator('.result-score').textContent()),100);
      }
      await page.getByRole('button',{name:'Next journey',exact:true}).click();await ready(page);
      assert.equal(await page.locator('.summary-value').count(),0);
    }
    // Force the end of the shuffled bag; the next bag continues and survives reload.
    await page.evaluate(challenges=>{const key=Object.keys(localStorage).find(k=>k.startsWith('trainrot-endless-v1:'));const s=JSON.parse(localStorage.getItem(key));let hash=2166136261;for(const char of s.seed)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;const deck=challenges.filter(c=>c.difficulty===s.difficulty);for(let i=deck.length-1;i>0;i--){hash=(Math.imul(hash,1664525)+1013904223)>>>0;const j=hash%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}s.position=deck.length-1;s.challenge=deck.at(-1);s.deck=deck.map(({from,to})=>({from,to}));s.recent=[s.challenge];s.state={phase:'planning',legs:[],guesses:[],assisted:false};localStorage.setItem(key,JSON.stringify(s));},challenges);
    await page.reload();await ready(page);const last=await current(page),oldSeed=(await saved(page)).seed;
    await page.getByRole('button',{name:'Skip',exact:true}).click();await ready(page);
    assert.notEqual((await saved(page)).seed,oldSeed);assert.notDeepEqual(await current(page),last);
    const afterWrap=await current(page);await page.reload();await ready(page);assert.deepEqual(await current(page),afterWrap);
    const hint=page.locator('.map-hint');assert.equal(await hint.getAttribute('open'),null);assert.equal(await page.getByRole('button',{name:'Show subway map',exact:true}).isVisible(),false);
    await hint.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await hint.getAttribute('open'),'');assert.match(await hint.innerText(),/makes this journey unscored/);
    assert.match(await page.locator('#city-map').getAttribute('aria-label'),/Subway lines are hidden/);assert.equal((await saved(page)).state.assisted,false);await inspect(page,`${prefix}-hint-open`);
    await page.keyboard.press('Enter');assert.equal(await hint.getAttribute('open'),null);assert.equal((await saved(page)).state.assisted,false);
    await hint.locator('summary').click();await page.getByRole('button',{name:'Show subway map',exact:true}).click();assert.match(await page.locator('#city-map').getAttribute('aria-label'),/Subway lines are shown/);assert.equal((await saved(page)).state.assisted,true);assert.equal(await page.locator('#city-map').evaluate(n=>n===document.activeElement),true);await inspect(page,`${prefix}-hint`);
    assert.equal(await page.locator('.map-caption').isVisible(),false);assert.equal(await hint.count(),0);
    await page.getByRole('button',{name:'Show answer',exact:true}).click();
    assert.equal(await page.locator('.result-heading').count(),0);assert.ok(await page.locator('.result-legs li').count());await inspect(page,`${prefix}-answer`);
    await page.reload();await page.locator('#next').waitFor();assert.equal(await page.locator('.result-heading').count(),0);
    await page.getByRole('button',{name:'Next journey',exact:true}).click();const beforeSkip=await current(page);
    await page.getByRole('button',{name:'Skip',exact:true}).click();await ready(page);assert.notDeepEqual(await current(page),beforeSkip);
    await page.getByRole('button',{name:'Show answer',exact:true}).click();await page.locator('#next').waitFor();
    await page.route('**/data/network.json',route=>route.abort(),{times:1});await page.reload();await page.locator('#reload').waitFor();await inspect(page,`${prefix}-network-error`);
    await page.getByRole('button',{name:'Reload game',exact:true}).click();await page.locator('#next').waitFor();
    await puzzle(page,'L08','M18');await add(page,'L');await check(page);assert.match(await page.locator('.partial-score').textContent(),/^41 points so far/);
    assert.equal(await page.locator('.route-path').count(),0);assert.equal(await page.locator('.result-legs').count(),0);assert.equal(await page.locator('#reveal').isDisabled(),true);
    await inspect(page,`${prefix}-partial-L`);await add(page,'6');assert.equal(await page.locator('.route-feedback').count(),0);await check(page);
    assert.match(await page.locator('.route-feedback').textContent(),/6 to Bleecker St \/ Broadway-Lafayette St\. What next\?/);await page.reload();await ready(page);assert.equal(await page.locator('.train-sequence li').count(),2);
    await inspect(page,`${prefix}-partial-L6`);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:new URL(`${prefix}-simple-partial.png`,output).pathname,fullPage:true});
    await add(page,'F');await check(page);assert.equal(parseInt(await page.locator('.result-score').textContent()),98);
    assert.match(await page.locator('.result-subtitle').textContent(),/30 sec slower/);assert.equal(await page.locator('.route-details').getAttribute('open'),null);
    assert.equal(await page.locator('.primary-itinerary h3').filter({hasText:'Your route'}).isVisible(),true);assert.ok(await page.locator('.planner > .result-route .result-legs li').count());
    await page.getByRole('button',{name:'Fastest route',exact:true}).click();assert.equal(await page.locator('#map-caption').textContent(),'Fastest route');assert.match(await page.locator('#city-map').getAttribute('aria-label'),/Directions are in the result/);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:new URL(`${prefix}-simple-result.png`,output).pathname,fullPage:true});
    await page.locator('.route-details summary').click();const directions=await page.locator('.primary-itinerary').textContent();assert.match(directions,/Union Sq/);assert.match(directions,/Bleecker/);
    assert.equal((await page.locator('.ride-points li span:last-child').allTextContents()).reduce((sum,p)=>sum+parseInt(p),0),98);await inspect(page,`${prefix}-L6F-result`);
    await page.reload();await page.locator('#next').waitFor();assert.equal(parseInt(await page.locator('.result-score').textContent()),98);
    await page.getByRole('button',{name:'Next journey',exact:true}).click();await add(page,'L');await add(page,'7');await check(page);
    assert.match(await page.locator('.route-feedback').textContent(),/do not connect in this order/);await inspect(page,`${prefix}-disconnected`);
    await page.getByRole('button',{name:'Undo last train',exact:true}).click();await add(page,'F');await check(page);assert.equal(parseInt(await page.locator('.result-score').textContent()),100);
    await page.getByRole('button',{name:'Next journey',exact:true}).click();await add(page,'L');await add(page,'6');await add(page,'M');await check(page);assert.equal(parseInt(await page.locator('.result-score').textContent()),95);
    await page.getByRole('button',{name:'Next journey',exact:true}).click();await add(page,'L');await add(page,'M');await check(page);assert.equal(parseInt(await page.locator('.result-score').textContent()),98);
    await page.getByRole('button',{name:'Next journey',exact:true}).click();
    for(let index=0;index<6;index++){if(index)await page.getByRole('button',{name:'Undo last train',exact:true}).click();await add(page,String(index+1));await check(page);}
    assert.equal(await page.locator('h1').textContent(),'Out of guesses.');await inspect(page,`${prefix}-out-of-guesses`);
    await page.getByRole('button',{name:'Next journey',exact:true}).click();await ready(page);
    await puzzle(page,'G24','R31');
    await page.evaluate(()=>{
      const key=Object.keys(localStorage).find(k=>k.startsWith('trainrot-endless-v1:')),feed=key.slice('trainrot-endless-v1:'.length);localStorage.removeItem(key);
      localStorage.setItem(`last-stop-mode-v1:${feed}`,'practice');
      localStorage.setItem(`last-stop-practice-v1:${feed}`,JSON.stringify({seed:'practice:migration',round:0,history:[],pendingTrain:'A',state:{phase:'planning',legs:[{route:'G',to:'A42'}],guesses:[[{route:'G',to:'R31'}]],assisted:false}}));
    });
    await page.reload();await ready(page);assert.deepEqual(await page.locator('.train-sequence .train-badge').allTextContents(),['G','A']);await inspect(page,`${prefix}-legacy-draft`);
    await add(page,'R');await check(page);assert.equal(parseInt(await page.locator('.result-score').textContent()),100);
    await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('trainrot-endless-v1:'));const s=JSON.parse(localStorage.getItem(key));s.state={phase:'revealed',legs:[{route:'G',to:'R31'}],assisted:false};localStorage.setItem(key,JSON.stringify(s));});
    await page.reload();await page.getByRole('button',{name:'Keep guessing',exact:true}).click();await ready(page);await add(page,'A');await add(page,'R');await check(page);assert.equal(await page.locator('.result-score').textContent(),'—');
    await puzzle(page,'G22','R29');await add(page,'G');await check(page);
    assert.equal(await page.locator('#guess-feedback-title p').textContent(),'G to Hoyt-Schermerhorn Sts. What next?');
    assert.equal(await page.locator('.partial-score').textContent(),'77 points so far');
    await inspect(page,`${prefix}-G-transfer`);await page.screenshot({path:new URL(`${prefix}-G-transfer.png`,output).pathname,fullPage:true});
    await page.reload();await ready(page);assert.match(await page.locator('#guess-feedback-title').textContent(),/Hoyt-Schermerhorn/);
    await add(page,'A');assert.equal(await page.locator('#guess-feedback-title').count(),0);await check(page);
    assert.equal(parseInt(await page.locator('.result-score').textContent()),100);
    assert.equal(await page.locator('.result-subtitle').count(),0,'No repeated fastest-route subtitle');
    assert.equal(await page.getByRole('button',{name:'Best route',exact:true}).count(),0);
    assert.deepEqual(await page.locator('[data-route-layer=yours] .route-path').evaluateAll(ns=>ns.map(n=>n.getAttribute('stroke'))),['#'+network.routes.G.color,'#'+network.routes.A.color]);
    await page.getByRole('button',{name:'Compare',exact:true}).click();
    assert.equal(await page.locator('#map-caption').textContent(),'Your route solid · Fastest route dashed');
    assert.match(await page.locator('#city-map').getAttribute('aria-label'),/Your route is solid; the fastest route is dashed/);
    await page.screenshot({path:new URL(`${prefix}-charcoal-result.png`,output).pathname,fullPage:true});
    await puzzle(page,'D20','R31');await add(page,'A');await check(page);assert.match(await page.locator('.partial-score').textContent(),/^41 points so far/);
    await add(page,'R');await check(page);assert.equal(parseInt(await page.locator('.result-score').textContent()),73);await inspect(page,`${prefix}-AR-result`);
    await page.getByRole('button',{name:'Next journey',exact:true}).click();for(let index=0;index<6;index++)await add(page,'L');
    assert.equal(await page.locator('[data-route=L]').isDisabled(),true);await inspect(page,`${prefix}-six-trains`);
    await page.getByRole('button',{name:'Undo last train',exact:true}).click();assert.equal(await page.locator('[data-route=L]').isEnabled(),true);
    assert.deepEqual(errors.filter(error=>!error.includes('Failed to fetch')),[]);
    outcomes.push({url:base,viewport:size,status:'passed',endless:true,eightJourneys:true,deckWrap:true,shuttleSuffixes:true,expressShapes:true,bedfordL6F:98,bedfordL6M:95,west4AR:73,legacyMigration:true,persistence:true,keyboard:true,networkRecovery:true});
    console.log(`E2E ${prefix}: passed`);await context.close();
  }
  for(const c of challenges){const b=router.best(c.from,c.to);assert.equal(router.assess(c.from,c.to,b.legs.map(({route})=>({route}))).score,100);}
  console.log(`All ${challenges.length} optimal train sequences earn 100.`);
}finally{
  await fs.writeFile(new URL('e2e.json',output),JSON.stringify(outcomes,null,2));if(ui)await fs.writeFile(new URL('lintapple.json',output),JSON.stringify(reports,null,2));await browser.close();
}
if(ui&&reports.some(r=>r.findings.length))process.exitCode=1;
