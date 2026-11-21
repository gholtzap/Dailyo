import {rushSeed} from './rush-helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
import {rushDate,seededDeck,shuffle} from '../dist/daily/puzzles.js';
import {makeSet,preparePuzzles,roundCount} from '../dist/games/rot-puzzles.js';
import {extraPuzzle,prepareExtra} from '../dist/games/extra-puzzles.js';
import {createRouter} from '../dist/router.js';

const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url)));
const day='2026-11-16',start=new Date(`${day}T16:00:00Z`);
assert.equal(rushDate('2024-02-29',day),'2024-02-29');
for (const invalid of [null,'2026-02-29','2026-11-17','2026-11-1']) assert.equal(rushDate(invalid,day),day);
const lint=process.argv.includes('--ui'),reports=[];
const browser=await chromium.launch();
try{
  for(const viewport of policy.viewports){
    const {width}=viewport;
    const page=await browser.newPage({viewport,colorScheme:'dark',hasTouch:width===390,isMobile:width===390,permissions:['clipboard-read','clipboard-write']});
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
    let releaseTrain;
    const trainNetwork=new Promise(resolve=>{releaseTrain=resolve;});
    await page.route(`**/trainrot/?rush=0&date=${day}&run=*`,async route=>{
      await trainNetwork;
      await route.continue();
    },{times:1});
    const inspect=async(name,child=false)=>{
      if(!lint)return;
      await page.clock.resume();
      reports.push({name:`${width}-${name}`,...await checkPage(page,policy)});
      if(child){
        const frame=await (await page.locator('iframe:not(.feed-loading)').elementHandle()).contentFrame();
        reports.push({name:`${width}-${name}-game`,...await checkPage(frame,policy)});
      }
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
    };
    const status=page.locator('#rush-status');
    const timer=page.getByRole('timer');
    const track=page.locator('.rush-track');
    const game=name=>page.frameLocator(`iframe[title="${name}"]`);
    const loadJson=async path=>(await page.request.get(new URL(path,base).href)).json();

    await page.goto(base);
    await page.getByRole('link',{name:'Rush',exact:true}).waitFor();
    await status.filter({hasText:'flagrot didn’t load.'}).waitFor();
    await inspect('error');
    await page.getByText('Games',{exact:true}).press('Enter');
    await page.getByRole('navigation',{name:'Games'}).getByRole('link',{name:/^Vocabulary Word meanings$/}).waitFor();
    await inspect('directory');
    await page.getByText('Games',{exact:true}).press('Enter');
    await page.getByRole('button',{name:'Retry',exact:true}).press('Enter');
    const flags=await loadJson('/games/data/flags.json');
    const flagDeck=shuffle(flags,await rushSeed(page,'flags'));
    const flag=game('flagrot');
    await timer.filter({hasText:'Untimed'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Skip game',exact:true}).getAttribute('class'),'secondary rush-skip');
    await page.clock.fastForward(30000);
    assert.equal(await timer.textContent(),'Untimed');
    assert.equal(await track.isVisible(),false);
    assert.equal(await flag.locator('#question-title').evaluate(node=>node===document.activeElement),true);
    await inspect('flagrot',true);
    const preloadedFlag=page.locator(`iframe[src^="/flags/?rush=1&date=${day}&run="]`);
    assert.equal(await preloadedFlag.evaluate(node=>node.inert),true);
    await preloadedFlag.evaluate(node=>{node.dataset.preloadCheck='';});
    await flag.getByRole('button',{name:flagDeck[0].name,exact:true}).press('Enter');
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(200);
    await timer.filter({hasText:'8s'}).waitFor();
    assert.equal(await page.locator('iframe[title=flagrot][data-preload-check]').count(),1);
    await page.emulateMedia({reducedMotion:'reduce'});
    await track.waitFor({state:'visible'});
    const meter=()=>track.evaluate(node=>{
      const fill=node.firstElementChild;
      const {backgroundColor}=getComputedStyle(fill);
      const [red,green]=backgroundColor.match(/\d+/g).map(Number);
      return {width:fill.getBoundingClientRect().width,red,green};
    });
    // Pause preserves the deadline, rejects late answers, and resumes explicitly.
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    await status.filter({hasText:'Paused'}).waitFor();
    await page.clock.fastForward(20000);
    assert.equal(await timer.textContent(),'8s');
    await flag.locator('body').evaluate(()=>parent.postMessage({type:'rush-game',phase:'answered',correct:true},location.origin));
    assert.match(await status.textContent(),/Paused/);
    assert.equal(await page.getByRole('button',{name:'Skip game',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Resume',exact:true}).click();
    await status.filter({hasText:'flagrot · Round 2'}).waitFor();
    // A controlled visibility event exercises backgrounding in headless Chromium.
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await status.filter({hasText:'Paused'}).waitFor();
    await page.clock.fastForward(20000);
    assert.equal(await timer.textContent(),'8s');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    assert.match(await status.textContent(),/Paused/,'Returning must not start the clock until Resume');
    await page.getByRole('button',{name:'Resume',exact:true}).click();
    const full=await meter();
    assert.ok(full.width>30 && full.green>full.red);
    await page.clock.fastForward(4000);
    const half=await meter();
    assert.equal(await timer.textContent(),'4s');
    assert.ok(half.width/full.width>0.45 && half.width/full.width<0.55);
    await page.clock.fastForward(3500);
    const low=await meter();
    assert.equal(await timer.textContent(),'1s');
    assert.ok(low.width/full.width<0.1 && low.red>low.green);
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const [round,seconds] of [[1,6],[2,4],[3,4],[4,4]]){
      await flag.getByRole('button',{name:flagDeck[round].name,exact:true}).click();
      await status.filter({hasText:'Correct'}).waitFor();
      await page.clock.fastForward(200);
      await timer.filter({hasText:`${seconds}s`}).waitFor();
      assert.equal(await status.textContent(),`flagrot · Round ${round+2}`);
    }
    await flag.getByRole('group',{name:'Choose a place'}).getByRole('button').filter({
      hasNotText:flagDeck[5].name,
    }).first().click();
    await status.filter({hasText:'Missed'}).waitFor();
    await flag.locator('.choice.correct').filter({hasText:flagDeck[5].name}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Next game',exact:true}).getAttribute('class'),'primary rush-continue');
    await inspect('miss',true);
    await page.clock.fastForward(2400);

    const language=game('langrot');
    await timer.filter({hasText:'8s'}).waitFor();
    const languages=await loadJson('/games/data/languages.json');
    const firstLanguage=shuffle(languages,await rushSeed(page,'languages'))[0];
    await language.getByRole('button',{name:firstLanguage.name,exact:true}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(200);
    await timer.filter({hasText:'6s'}).waitFor();
    await inspect('langrot',true);
    await page.clock.fastForward(6100);
    await status.filter({hasText:'Time’s up'}).waitFor();
    await language.locator('.choice.correct').waitFor();
    await page.clock.fastForward(2400);

    await status.filter({hasText:'Loading trainrot…'}).waitFor();
    assert.equal(await timer.textContent(),'');
    assert.equal(await page.locator('iframe[title=langrot]').evaluate(node=>node.inert),true);
    await page.locator('iframe[title=langrot]').waitFor({state:'visible'});
    releaseTrain();
    const train=game('trainrot');
    await timer.filter({hasText:'35s'}).waitFor();
    await train.getByRole('heading',{name:'Find the fastest route'}).waitFor();
    await inspect('trainrot',true);
    const network=await loadJson('/data/network.json');
    const challenges=await loadJson('/data/challenges.json');
    const easy=challenges.filter(c=>c.difficulty==='easy');
    const challenge=seededDeck(await rushSeed(page,'train'),easy.length>=3?easy:challenges)[0];
    const best=createRouter(network).best(challenge.from,challenge.to);
    for(const {route} of best.legs)await train.locator(`button[data-route="${route}"]`).click();
    await train.getByRole('button',{name:'Check route'}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(200);
    await timer.filter({hasText:'28s'}).waitFor();
    const next=page.locator('#rush-next');
    const rot=async (kind,round=0)=>{
      const data=preparePuzzles(kind,await loadJson(`/games/data/${kind}.json`));
      const index=round%roundCount;
      return {data,question:makeSet(kind,data,await rushSeed(page,kind),round-index)[index]};
    };
    const extra=async (kind,...datasets)=>{
      const data=prepareExtra(kind,...await Promise.all(datasets.map(name=>loadJson(`/games/data/${name}.json`))));
      return extraPuzzle(kind,data,`${await rushSeed(page,kind)}:0`);
    };
    const placeYear=async (child,round=0)=>{
      const {question:{event,timeline}}=await rot('yearrot',round);
      await child.locator('.rot-slot').nth(timeline.filter(([year])=>year<event[0]).length).click();
    };
    const slots=[
      ['Vocabulary',12,9,async child=>{
        const words=await loadJson('/games/data/vocabulary.json');
        await child.getByRole('button',{name:shuffle(words,await rushSeed(page,'vocabulary'))[0].name,exact:true}).click();
      }],
      ['maprot',20,15,async child=>{
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
      ['yearrot',14,10,placeYear],
      ['borderrot',45,35,async child=>{
        const {data,question}=await rot('borderrot');
        for(const country of question.slice(1)){
          const name=data.graph.get(country).name;
          await child.getByRole('searchbox').fill(name);
          await child.getByRole('searchbox').press('Enter');
        }
      }],
      ['ladderrot',55,45,async child=>{
        const puzzle=await extra('ladderrot','ladderrot','ladder-words');
        for(const word of puzzle.solution.slice(1)){
          await child.getByRole('textbox').fill(word);
          await child.getByRole('button',{name:'Add word'}).click();
        }
      }],
      ['cluerot',20,15,async child=>{
        const puzzle=await extra('cluerot','cluerot');
        await child.getByRole('textbox').fill(puzzle.answer);
        await child.getByRole('button',{name:'Guess',exact:true}).click();
      }],
      ['scalerot',20,15,async child=>{
        const puzzle=await extra('scalerot','scalerot');
        await child.getByRole('spinbutton').fill(String(puzzle.actual));
        await child.getByRole('button',{name:'Check estimate'}).click();
      }],
      ['swaprot',50,40,async child=>{
        const {board}=await extra('swaprot');
        for(let i=board.findIndex((tile,i)=>tile>board[i+1]);i!==-1;i=board.findIndex((tile,i)=>tile>board[i+1])){
          await child.locator('.swap-tile').nth(i).click();
          await child.locator('.swap-tile').nth(i+1).click();
          [board[i],board[i+1]]=[board[i+1],board[i]];
        }
      }],
    ];
    for(const [name,openingSeconds,seconds,solve] of slots){
      await next.click();
      await timer.filter({hasText:`${openingSeconds}s`}).waitFor();
      await inspect(name,true);
      await solve(game(name));
      await status.filter({hasText:'Correct'}).waitFor();
      await page.clock.fastForward(200);
      await timer.filter({hasText:`${seconds}s`}).waitFor();
      if(name==='yearrot'){
        for(let round=1;round<=roundCount;round++){
          await placeYear(game(name),round);
          await status.filter({hasText:'Correct'}).waitFor();
          await page.clock.fastForward(200);
          await status.filter({hasText:`yearrot · Round ${round+2}`}).waitFor();
        }
      }
    }
    for(let i=0;i<11;i++)await next.click();
    await page.getByRole('heading',{name:'Rush recap'}).waitFor();
    assert.equal(await page.locator('#rush-score').textContent(),'20 correct · Best run: 6 in yearrot');
    assert.equal(await page.locator('#rush-personal-best').textContent(),'New best · 20 correct');
    assert.deepEqual(await page.evaluate(()=>Object.entries(localStorage)),[['dailyo:rush:best:all','20']]);
    assert.deepEqual(writes,[]);
    await page.getByRole('button',{name:'Copy results'}).press('Enter');
    await page.locator('#rush-copy-status').filter({hasText:'Copied'}).waitFor();
    const share=await page.evaluate(()=>navigator.clipboard.readText());
    const recapRows=await page.locator('#feed-results li span').allTextContents();
    assert.equal(share,[`dailyo Rush · ${day}`,'20 correct · 6 in yearrot','',...recapRows,'',`https://trainrot.vercel.app/rush/?date=${day}`].join('\n'));
    await inspect('recap');
    await page.getByRole('button',{name:'Play again'}).click();
    await timer.filter({hasText:'Untimed'}).waitFor();
    for(let i=0;i<21;i++)await page.getByRole('button',{name:'Skip game',exact:true}).click();
    assert.equal(await page.locator('#rush-score').textContent(),'0 correct');
    assert.equal(await page.locator('#rush-copy-status').textContent(),'');
    assert.equal(await page.locator('#rush-personal-best').textContent(),'Personal best · 20 correct');
    await page.getByRole('link',{name:'Play more langrot'}).click();
    await page.getByRole('button',{name:'Practice',exact:true,pressed:true}).waitFor();
    await page.goto(base);
    await page.getByRole('heading',{name:'Rush recap'}).waitFor();
    await page.getByRole('button',{name:'Play again'}).click();
    await timer.filter({hasText:'Untimed'}).waitFor();
    await page.getByRole('link',{name:'Daily mix',exact:true}).click();
    await page.waitForURL('**/daily/');
    await page.getByRole('link',{name:'Daily mix',exact:true}).waitFor();
    if(new URL(base).hostname==='127.0.0.1'){
      await page.route('**/rush/**',async route=>{
        await route.fulfill({response:await page.request.get(base)});
      });
    }
    const sharedChallenge=new URL(share.split('\n').at(-1));
    await page.clock.setFixedTime(new Date('2026-11-17T16:00:00Z'));
    await page.goto(new URL(sharedChallenge.pathname+sharedChallenge.search,base).href);
    const sharedDeck=shuffle(flags,await rushSeed(page,'flags'));
    await game('flagrot').getByRole('button',{name:sharedDeck[0].name,exact:true}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(200);
    await game('flagrot').getByRole('button',{name:sharedDeck[1].name,exact:true}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.goto(new URL(`/rush/scalerot/?date=${day}`,base).href);
    await page.getByRole('timer').filter({hasText:'Untimed'}).waitFor();
    const scale=game('scalerot');
    const data=prepareExtra('scalerot',await loadJson('/games/data/scalerot.json'));
    const puzzle=extraPuzzle('scalerot',data,`${await rushSeed(page,'scalerot')}:0`);
    await scale.getByRole('spinbutton').fill(String(puzzle.actual));
    await scale.getByRole('button',{name:'Check estimate'}).click();
    await status.filter({hasText:'Correct'}).waitFor();
    await page.clock.fastForward(200);
    await timer.filter({hasText:'20s'}).waitFor();
    await page.clock.fastForward(20100);
    await scale.locator('.rot-feedback').filter({hasText:'Answer:'}).waitFor();
    await page.clock.fastForward(2400);
    await page.locator('#feed-results li').waitFor();
    assert.equal(await page.locator('#feed-results li').count(),1);
    assert.equal(await page.locator('#rush-personal-best').textContent(),'New best · 1 correct');
    assert.equal(await page.evaluate(()=>localStorage.getItem('dailyo:rush:best:all')),'20');
    assert.equal(await page.evaluate(()=>localStorage.getItem('dailyo:rush:best:scalerot')),'1');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:undefined}));
    await page.getByRole('button',{name:'Copy results'}).click();
    const manual=page.getByRole('textbox',{name:'Rush results to copy'});
    assert.equal(await manual.inputValue(),`dailyo Rush · scalerot · ${day}\n1 correct\n\nhttps://trainrot.vercel.app/rush/scalerot/?date=${day}`);
    assert.ok(await manual.evaluate(node=>node===document.activeElement&&node.selectionEnd===node.value.length&&node.selectionStart===0));
    await inspect('copy fallback');
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(`${width}px Rush: all twenty-one games, one untimed opener, preloaded swaps, timed rounds, misses, timeouts and single-game links passed`);
  }
  if(lint){
    await fs.mkdir('test-results',{recursive:true});
    await fs.writeFile('test-results/rush-ui.json',JSON.stringify(reports,null,2));
    for(const {name,findings} of reports)console.log(`${name}: ${findings.length} findings`);
    if(reports.some(report=>report.findings.length))process.exitCode=1;
  }
}finally{await browser.close();}
