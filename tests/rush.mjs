import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {seededDeck,shuffle} from '../dist/daily/puzzles.js';
import {createRouter} from '../dist/router.js';

const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url)));
const day='2026-11-16',start=new Date(`${day}T16:00:00Z`);
const lint=process.argv.includes('--ui'),reports=[];
const browser=await chromium.launch();
try{
  for(const viewport of policy.viewports){
    const {width}=viewport;
    const page=await browser.newPage({viewport,colorScheme:'dark',hasTouch:width===390,isMobile:width===390});
    const errors=[],writes=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
    await page.clock.install({time:new Date(start-10000)});
    await page.clock.pauseAt(start);
    let failFlag=true;
    await page.route('**/games/data/flags.json',route=>{
      if(!failFlag)return route.continue();
      failFlag=false;
      return route.fulfill({status:503});
    });
    const inspect=async(name,child=false)=>{
      if(!lint)return;
      await page.clock.resume();
      reports.push({name:`${width}-${name}`,...await checkPage(page,policy)});
      if(child){
        const frame=page.frames().find(frame=>frame!==page.mainFrame());
        reports.push({name:`${width}-${name}-game`,...await checkPage(frame,policy)});
      }
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
    };
    const status=page.locator('#rush-status');
    const timer=page.getByRole('timer');
    const game=name=>page.frameLocator(`iframe[title="${name}"]`);
    const loadJson=async path=>(await page.request.get(new URL(path,base).href)).json();

    await page.goto(base);
    await page.getByRole('heading',{name:'Rush',exact:true}).waitFor();
    assert.equal(await page.locator('iframe').count(),0);
    await inspect('start');
    await page.getByText('Games',{exact:true}).press('Enter');
    await page.getByRole('navigation',{name:'Games'}).getByRole('link',{name:'Vocabulary'}).waitFor();
    await inspect('directory');
    await page.getByText('Games',{exact:true}).press('Enter');
    await page.getByRole('button',{name:'Start Rush'}).press('Enter');
    await status.filter({hasText:'flagrot didn’t load.'}).waitFor();
    await inspect('error');
    await page.getByRole('button',{name:'Retry',exact:true}).press('Enter');
    const flags=await loadJson('/games/data/flags.json');
    const flagDeck=shuffle(flags,`rush:flags:${day}`);
    const flag=game('flagrot');
    await timer.filter({hasText:'8s'}).waitFor();
    assert.equal(await flag.locator('#question-title').evaluate(node=>node===document.activeElement),true);
    await inspect('flagrot',true);
    await flag.getByRole('button',{name:flagDeck[0].name,exact:true}).press('Enter');
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(900);
    await timer.filter({hasText:'6s'}).waitFor();
    await flag.getByRole('button',{name:flagDeck[1].name,exact:true}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(900);
    await timer.filter({hasText:'4s'}).waitFor();
    await flag.getByRole('group',{name:'Choose a place'}).getByRole('button').filter({
      hasNotText:flagDeck[2].name,
    }).first().click();
    await status.filter({hasText:'Missed'}).waitFor();
    await flag.locator('.feedback').filter({hasText:flagDeck[2].name}).waitFor();
    await inspect('miss',true);
    await page.clock.fastForward(2700);

    const language=game('langrot');
    await timer.filter({hasText:'8s'}).waitFor();
    await language.getByRole('group',{name:'Choose a language'}).waitFor();
    await inspect('langrot',true);
    await page.clock.fastForward(8100);
    await status.filter({hasText:'Time’s up'}).waitFor();
    await language.locator('.feedback').filter({hasText:'Correct answer'}).waitFor();
    await page.clock.fastForward(2700);

    const train=game('trainrot');
    await timer.filter({hasText:'35s'}).waitFor();
    await train.getByRole('heading',{name:'Find the fastest route'}).waitFor();
    await inspect('trainrot',true);
    const network=await loadJson('/data/network.json');
    const challenges=await loadJson('/data/challenges.json');
    const easy=challenges.filter(c=>c.difficulty==='easy');
    const challenge=seededDeck(`rush:train:${day}`,easy.length>=3?easy:challenges)[0];
    const best=createRouter(network).best(challenge.from,challenge.to);
    for(const {route} of best.legs)await train.locator(`button[data-route="${route}"]`).click();
    await train.getByRole('button',{name:'Check route'}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(900);
    await timer.filter({hasText:'28s'}).waitFor();
    await page.getByRole('button',{name:'Next game'}).click();
    await page.getByRole('heading',{name:'Rush recap'}).waitFor();
    assert.equal(await page.locator('#rush-score').textContent(),'3 correct · Best run: 2 in flagrot');
    assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
    assert.deepEqual(writes,[]);
    await inspect('recap');
    await page.getByRole('button',{name:'Play again'}).click();
    await timer.filter({hasText:'8s'}).waitFor();
    for(let i=0;i<3;i++)await page.getByRole('button',{name:'Next game'}).click();
    assert.equal(await page.locator('#rush-score').textContent(),'0 correct');
    await page.getByRole('link',{name:'Play more langrot'}).click();
    await page.getByRole('button',{name:'Practice',exact:true,pressed:true}).waitFor();
    await page.goto(base);
    await page.getByRole('button',{name:'Start Rush'}).click();
    await timer.filter({hasText:'8s'}).waitFor();
    await page.getByRole('link',{name:'Daily Feed',exact:true}).click();
    await page.waitForURL('**/daily/');
    await page.getByRole('heading',{name:'Daily Feed'}).waitFor();
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(`${width}px Rush: retry, decreasing clocks, incorrect answer, timeout, route scoring, skip, recap, practice and Daily Feed passed`);
  }
  if(lint){
    await fs.mkdir('test-results',{recursive:true});
    await fs.writeFile('test-results/rush-ui.json',JSON.stringify(reports,null,2));
    for(const {name,findings} of reports)console.log(`${name}: ${findings.length} findings`);
    if(reports.some(report=>report.findings.length))process.exitCode=1;
  }
}finally{await browser.close();}
