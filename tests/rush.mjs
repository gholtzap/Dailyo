import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {seededDeck,shuffle} from '../dist/daily/puzzles.js';
import {makeSet,preparePuzzles} from '../dist/games/rot-puzzles.js';
import {extraPuzzle,prepareExtra} from '../dist/games/extra-puzzles.js';
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
    await status.filter({hasText:'flagrot didn’t load.'}).waitFor();
    await inspect('error');
    await page.getByText('Games',{exact:true}).press('Enter');
    await page.getByRole('navigation',{name:'Games'}).getByRole('link',{name:'Vocabulary'}).waitFor();
    await inspect('directory');
    await page.getByText('Games',{exact:true}).press('Enter');
    await page.getByRole('button',{name:'Retry',exact:true}).press('Enter');
    const flags=await loadJson('/games/data/flags.json');
    const flagDeck=shuffle(flags,`rush:flags:${day}`);
    const flag=game('flagrot');
    await timer.filter({hasText:'Untimed'}).waitFor();
    await page.clock.fastForward(30000);
    assert.equal(await timer.textContent(),'Untimed');
    assert.equal(await flag.locator('#question-title').evaluate(node=>node===document.activeElement),true);
    await inspect('flagrot',true);
    await flag.getByRole('button',{name:flagDeck[0].name,exact:true}).press('Enter');
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(900);
    await timer.filter({hasText:'8s'}).waitFor();
    await flag.getByRole('button',{name:flagDeck[1].name,exact:true}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(900);
    await timer.filter({hasText:'6s'}).waitFor();
    await flag.getByRole('group',{name:'Choose a place'}).getByRole('button').filter({
      hasNotText:flagDeck[2].name,
    }).first().click();
    await status.filter({hasText:'Missed'}).waitFor();
    await flag.locator('.feedback').filter({hasText:flagDeck[2].name}).waitFor();
    await inspect('miss',true);
    await page.clock.fastForward(2700);

    const language=game('langrot');
    await timer.filter({hasText:'Untimed'}).waitFor();
    const languages=await loadJson('/games/data/languages.json');
    const firstLanguage=shuffle(languages,`rush:languages:${day}`)[0];
    await language.getByRole('button',{name:firstLanguage.name,exact:true}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(900);
    await timer.filter({hasText:'8s'}).waitFor();
    await inspect('langrot',true);
    await page.clock.fastForward(8100);
    await status.filter({hasText:'Time’s up'}).waitFor();
    await language.locator('.feedback').filter({hasText:'Correct answer'}).waitFor();
    await page.clock.fastForward(2700);

    const train=game('trainrot');
    await timer.filter({hasText:'Untimed'}).waitFor();
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
    await timer.filter({hasText:'35s'}).waitFor();
    const next=page.getByRole('button',{name:'Next game'});
    const rot=async kind=>{
      const data=preparePuzzles(kind,await loadJson(`/games/data/${kind}.json`));
      return {data,question:makeSet(kind,data,`rush:${kind}:${day}`)[0]};
    };
    const extra=async (kind,...datasets)=>{
      const data=prepareExtra(kind,...await Promise.all(datasets.map(name=>loadJson(`/games/data/${name}.json`))));
      return extraPuzzle(kind,data,`rush:${kind}:${day}:0`);
    };
    const slots=[
      ['Vocabulary',12,async child=>{
        const words=await loadJson('/games/data/vocabulary.json');
        await child.getByRole('button',{name:shuffle(words,`rush:vocabulary:${day}`)[0].name,exact:true}).click();
      }],
      ['maprot',20,async child=>{
        const {question:[,,lon,lat]}=await rot('maprot');
        const map=child.locator('.rot-map');
        const position=await map.evaluate((svg,[lon,lat])=>{
          const {x,y}=new DOMPoint(lon+180,90-lat).matrixTransform(svg.getScreenCTM());
          const bounds=svg.getBoundingClientRect();
          return {x:x-bounds.left,y:y-bounds.top};
        },[lon,lat]);
        await map.click({position});
        await child.getByRole('button',{name:'Check pin'}).click();
      }],
      ['yearrot',14,async child=>{
        const {question:{event,timeline}}=await rot('yearrot');
        await child.locator('.rot-slot').nth(timeline.filter(([year])=>year<event[0]).length).click();
      }],
      ['borderrot',45,async child=>{
        const {data,question}=await rot('borderrot');
        for(const country of question.slice(1)){
          const name=data.graph.get(country).name;
          await child.getByRole('searchbox').fill(name);
          await child.getByRole('searchbox').press('Enter');
        }
      }],
      ['ladderrot',55,async child=>{
        const puzzle=await extra('ladderrot','ladderrot','ladder-words');
        for(const word of puzzle.solution.slice(1)){
          await child.getByRole('textbox').fill(word);
          await child.getByRole('button',{name:'Add word'}).click();
        }
      }],
      ['cluerot',20,async child=>{
        const puzzle=await extra('cluerot','cluerot');
        await child.getByRole('textbox').fill(puzzle.answer);
        await child.getByRole('button',{name:'Guess',exact:true}).click();
      }],
      ['scalerot',20,async child=>{
        const puzzle=await extra('scalerot','scalerot');
        await child.getByRole('spinbutton').fill(String(puzzle.actual));
        await child.getByRole('button',{name:'Check estimate'}).click();
      }],
      ['swaprot',50,async child=>{
        const {board}=await extra('swaprot');
        for(let i=board.findIndex((tile,i)=>tile>board[i+1]);i!==-1;i=board.findIndex((tile,i)=>tile>board[i+1])){
          await child.locator('.swap-tile').nth(i).click();
          await child.locator('.swap-tile').nth(i+1).click();
          [board[i],board[i+1]]=[board[i+1],board[i]];
        }
      }],
    ];
    for(const [name,seconds,solve] of slots){
      await next.click();
      await timer.filter({hasText:'Untimed'}).waitFor();
      await inspect(name,true);
      await solve(game(name));
      await status.filter({hasText:'Correct'}).waitFor();
      await page.clock.fastForward(900);
      await timer.filter({hasText:`${seconds}s`}).waitFor();
    }
    await next.click();
    await page.getByRole('heading',{name:'Rush recap'}).waitFor();
    assert.equal(await page.locator('#rush-score').textContent(),'12 correct · Best run: 2 in flagrot');
    assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
    assert.deepEqual(writes,[]);
    await inspect('recap');
    await page.getByRole('button',{name:'Play again'}).click();
    await timer.filter({hasText:'Untimed'}).waitFor();
    for(let i=0;i<11;i++)await page.getByRole('button',{name:'Next game'}).click();
    assert.equal(await page.locator('#rush-score').textContent(),'0 correct');
    await page.getByRole('link',{name:'Play more langrot'}).click();
    await page.getByRole('button',{name:'Practice',exact:true,pressed:true}).waitFor();
    await page.goto(base);
    await timer.filter({hasText:'Untimed'}).waitFor();
    await page.getByRole('link',{name:'Daily Feed',exact:true}).click();
    await page.waitForURL('**/daily/');
    await page.getByRole('heading',{name:'Daily Feed'}).waitFor();
    if(!process.env.TRAINROT_TEST_URL){
      await page.route('**/rush/**',async route=>{
        await route.fulfill({response:await page.request.get(base)});
      });
    }
    await page.goto(new URL('/rush/',base).href);
    await game('flagrot').locator('.choice').first().waitFor();
    await page.goto(new URL('/rush/scalerot/',base).href);
    await page.getByRole('timer').filter({hasText:'Untimed'}).waitFor();
    const scale=game('scalerot');
    const data=prepareExtra('scalerot',await loadJson('/games/data/scalerot.json'));
    const puzzle=extraPuzzle('scalerot',data,`rush:scalerot:${day}:0`);
    await scale.getByRole('spinbutton').fill(String(puzzle.actual));
    await scale.getByRole('button',{name:'Check estimate'}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(900);
    await timer.filter({hasText:'20s'}).waitFor();
    await page.clock.fastForward(20100);
    await scale.locator('.rot-feedback').filter({hasText:'Answer:'}).waitFor();
    await page.clock.fastForward(2700);
    assert.equal(await page.locator('#feed-results li').count(),1);
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(`${width}px Rush: all eleven games, untimed openers, timed rounds, misses, timeouts and single-game links passed`);
  }
  if(lint){
    await fs.mkdir('test-results',{recursive:true});
    await fs.writeFile('test-results/rush-ui.json',JSON.stringify(reports,null,2));
    for(const {name,findings} of reports)console.log(`${name}: ${findings.length} findings`);
    if(reports.some(report=>report.findings.length))process.exitCode=1;
  }
}finally{await browser.close();}
