import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
import {checkPage} from 'lintapple';

const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url)));
const lint=process.argv.includes('--ui'),reports=[];
const engine=process.argv.includes('--webkit')?webkit:chromium;
const browser=await engine.launch();
const date=new Date('2026-11-16T16:00:00Z');

async function swipe(session,x,startY,endY){
  const send=(type,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:y===undefined?[]:[{x,y}]});
  await send('touchStart',startY);
  for(let i=1;i<=5;i++)await send('touchMove',startY+(endY-startY)*i/5);
  await send('touchEnd');
}

try{
  for(const {width,height} of policy.viewports){
    const mobile=width===390;
    const context=await browser.newContext({viewport:{width,height},colorScheme:'dark',hasTouch:mobile,isMobile:mobile});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.setFixedTime(date);
    const inspect=async(name,frameTitle)=>{
      if(!lint)return;
      const report=await checkPage(page,policy);
      reports.push({name:`${width}-${name}`,...report});
      if(frameTitle){
        const iframe=await page.locator(`iframe[title="${frameTitle}"]`).elementHandle();
        const child=await iframe.contentFrame();
        const report=await checkPage(child,policy);
        reports.push({name:`${width}-${name}-game`,...report});
      }
    };
    const frame=name=>page.frameLocator(`iframe[title="${name}"]`);
    const next=page.getByRole('button',{name:'Next game',exact:true});
    const skip=page.getByRole('button',{name:'Skip game',exact:true});
    const progress=page.locator('#feed-progress');
    const enterFeed=()=>page.getByRole('link',{name:'Daily Feed',exact:true}).click();

    await page.goto(base);
    await page.locator('[data-route]').first().waitFor();
    await page.getByRole('button',{name:'Practice',exact:true}).click();
    await enterFeed();
    const train=frame('trainrot');
    const map=train.locator('#city-map');
    await map.waitFor({state:'visible'});
    assert.equal(await progress.innerText(),'Game 1 of 7');
    assert.equal(await train.getByRole('button',{name:'Practice',exact:true}).count(),0);
    const touch=mobile&&engine===chromium?await context.newCDPSession(page):null;
    if(touch){
      const bounds=await map.boundingBox(),mapX=bounds.x+bounds.width/2,mapY=bounds.y+bounds.height/2;
      await swipe(touch,mapX,mapY+65,mapY);
      assert.equal(await progress.innerText(),'Game 1 of 7');
      assert.equal(await next.isVisible(),false);
    }
    await inspect('train-questions','trainrot');
    await train.getByRole('button',{name:'Show answer',exact:true}).click();
    await next.waitFor();
    await inspect('train-result','trainrot');
    if(touch){
      const area=await page.locator('#feed-continue').boundingBox();
      await swipe(touch,area.x+area.width/2,area.y+area.height-2,area.y+2);
    }else if(mobile){
      await next.tap();
    }else{
      await page.goto(base);
      await page.locator('#skip').waitFor();
      await page.getByRole('button',{name:'Daily',exact:true}).click();
      await page.getByRole('button',{name:'Copy results',exact:true}).waitFor();
      await page.getByRole('button',{name:'Practice',exact:true}).click();
      await enterFeed();
    }
    const flags=frame('flagrot');
    await flags.locator('.choice').first().waitFor();
    assert.equal(await progress.innerText(),'Game 2 of 7');
    assert.equal(await page.evaluate(()=>localStorage.getItem('trainrot-game-mode-v2')),'practice');
    const standalone=await context.newPage();
    await standalone.clock.setFixedTime(date);
    await standalone.goto(`${base}/flags/`);
    await standalone.locator('.choice').first().waitFor();
    assert.equal(await flags.locator('.flag').getAttribute('src'),await standalone.locator('.flag').getAttribute('src'));
    await standalone.locator('.choice').first().click();
    await standalone.getByRole('button',{name:'Practice',exact:true}).click();
    await standalone.close();
    await page.reload();
    const nextQuestion=flags.getByRole('button',{name:'Next question',exact:true});
    await nextQuestion.waitFor();
    assert.equal(await flags.getByRole('button',{name:'Practice',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('trainrot:flags:v1:mode'))),'practice');
    await inspect('flag-answer','flagrot');
    await nextQuestion.click();
    for(let question=2;question<=5;question++){
      await flags.locator('.choice').first().click();
      await flags.locator('#next').click();
    }
    await next.waitFor();
    await inspect('flag-result','flagrot');
    await next.focus();
    await page.keyboard.press('Enter');

    const languages=frame('langrot');
    await languages.locator('.choice').first().waitFor();
    assert.equal(await progress.innerText(),'Game 3 of 7');
    await inspect('language-question','langrot');
    const data='**/games/data/vocabulary.json';
    let release;
    const waiting=new Promise(resolve=>{release=resolve;});
    await page.route(data,async route=>{await waiting;await route.fulfill({status:503});});
    await skip.click();
    await page.getByText('Loading Vocabulary…',{exact:true}).waitFor();
    await inspect('loading');
    release();
    const retry=page.getByRole('button',{name:'Retry game',exact:true});
    await retry.waitFor();
    await inspect('error');
    await page.unroute(data);
    await retry.click();

    const words=frame('Vocabulary');
    await words.locator('.choice').first().click();
    const word=await words.locator('.vocabulary-word').innerText();
    await page.reload();
    await words.locator('.example').waitFor();
    assert.equal(await words.locator('.vocabulary-word').innerText(),word);
    assert.equal(await progress.innerText(),'Game 4 of 7');
    await inspect('vocabulary-answer','Vocabulary');
    await words.locator('#next').click();
    for(let question=2;question<=5;question++){
      await words.locator('.choice').first().click();
      await words.locator('#next').click();
    }
    await next.waitFor();
    await inspect('vocabulary-result','Vocabulary');
    await next.click();
    const geo=frame('maprot'),history=frame('yearrot'),borders=frame('borderrot');
    for(const game of [geo,history,borders]){
      await game.locator('#round-title').waitFor();
      await skip.click();
    }
    await page.getByRole('heading',{name:'Daily recap'}).waitFor();
    const rows=page.locator('#feed-results li');
    assert.deepEqual(await rows.allTextContents(),[
      'trainrotAnswer shown', 'flagrot'+await score('flags'), 'langrotSkipped', 'Vocabulary'+await score('vocabulary'),
      'maprotSkipped', 'yearrotSkipped', 'borderrotSkipped',
    ]);
    async function score(kind){
      const check=await context.newPage();
      await check.clock.setFixedTime(date);
      await check.goto(`${base}/${kind}/`);
      await check.locator('.choice,.result h2').first().waitFor();
      await check.getByRole('button',{name:'Daily',exact:true}).click();
      const result=await check.locator('.result h2').innerText();
      await check.close();
      return result;
    }
    await inspect('recap');
    await page.reload();
    const replay=page.getByRole('button',{name:'Play skipped games'});
    await replay.click();
    await languages.locator('.choice').first().waitFor();
    for(let question=1;question<=5;question++){
      await languages.locator('.choice').first().click();
      await languages.locator('#next').click();
    }
    await next.click();

    await geo.locator('.rot-map').press('ArrowRight');
    await geo.getByRole('button',{name:'Check pin'}).click();
    const geoStandalone=await context.newPage();
    await geoStandalone.clock.setFixedTime(date);
    await geoStandalone.goto(`${base}/maprot/`);
    assert.match(await geoStandalone.locator('.rot-feedback').innerText(),/km away/);
    await geoStandalone.getByRole('button',{name:'Practice',exact:true}).click();
    await geoStandalone.close();
    await page.reload();
    await geo.getByRole('button',{name:'Next question'}).click();
    assert.equal(await geo.getByRole('button',{name:'Practice',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dailyo:maprot:v1:mode'))),'practice');
    for(let question=2;question<=5;question++){
      await geo.locator('.rot-map').press('ArrowRight');
      await geo.getByRole('button',{name:'Check pin'}).click();
      await geo.locator('.rot-next').click();
    }
    await next.waitFor();
    await inspect('map-result','maprot');
    await next.click();
    for(let question=1;question<=5;question++){
      await history.locator('.rot-slot').first().click();
      await history.locator('.rot-next').click();
    }
    await next.waitFor();
    await inspect('timeline-result','yearrot');
    await next.click();
    for(let question=1;question<=5;question++){
      await borders.getByRole('button',{name:'Show shortest route'}).click();
      await borders.locator('.rot-next').click();
    }
    await page.getByRole('button',{name:'See recap',exact:true}).waitFor();
    await inspect('border-result','borderrot');
    await page.getByRole('button',{name:'See recap',exact:true}).click();
    await page.getByRole('heading',{name:'Daily recap'}).waitFor();
    assert.equal(await replay.isVisible(),false);
    assert.equal(await rows.filter({hasText:'Skipped'}).count(),0);
    assert.match(await rows.nth(4).innerText(),/maprot\s+[\d,]+ km off/);
    assert.match(await rows.nth(5).innerText(),/yearrot\s+[0-5] out of 5/);
    assert.match(await rows.nth(6).innerText(),/borderrot\s+0 out of 5/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.clock.setFixedTime(new Date('2026-11-17T16:00:00Z'));
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await frame('trainrot').locator('[data-route]').first().waitFor();
    assert.equal(await progress.innerText(),'Game 1 of 7');
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`${width}px Daily Feed: shared progress, all seven games, skip, retry, recap, reload, and daily rollover passed`);
  }
}finally{
  if(lint){
    await fs.mkdir('test-results',{recursive:true});
    await fs.writeFile('test-results/daily-feed-ui.json',JSON.stringify(reports,null,2));
    for(const report of reports)console.log(`${report.name}: ${report.findings.length} findings`);
    if(reports.some(report=>report.findings.length))process.exitCode=1;
  }
  await browser.close();
}
