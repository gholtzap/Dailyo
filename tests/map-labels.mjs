import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true});
const reports=[];
try {
  for(const width of [390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:1000}});
    await page.goto(base);await page.getByRole('group',{name:'Add a train',exact:true}).waitFor();
    const report=await page.evaluate(async()=>{
      const [{createMap},network,boroughs,challenges]=await Promise.all([
        import('./map.js'),fetch('./data/network.json').then(r=>r.json()),
        fetch('./data/boroughs.json').then(r=>r.json()),fetch('./data/challenges.json').then(r=>r.json())
      ]);
      const old=document.querySelector('#city-map'),svg=old.cloneNode(false);
      document.querySelector('.map-labels').remove();old.replaceWith(svg);
      const map=createMap(svg,boroughs,network),failures=[];let checked=0,visibleNames=0;
      const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      function check(label){
        checked++;
        const visible=[...document.querySelectorAll('.map-marker-name,.map-marker-badge,.map-place')].filter(n=>n.getClientRects().length);
        const names=visible.filter(n=>n.matches('.map-marker-name'));visibleNames+=names.length;
        const obstacles=[...document.querySelectorAll('.map-caption')].filter(n=>n.getClientRects().length);
        for(const name of names){
          const box=name.getBoundingClientRect(),panel=svg.getBoundingClientRect();
          if(box.left<panel.left||box.right>panel.right||box.top<panel.top||box.bottom>panel.bottom)failures.push({label,clipped:name.textContent});
          for(const other of [...visible,...obstacles]){
            if(other===name)continue;
            if(overlaps(box,other.getBoundingClientRect()))failures.push({label,a:name.textContent,b:other.textContent});
          }
        }
      }
      for(const [index,challenge] of challenges.entries()){
        map.setChallenge(challenge);check(`journey ${index}`);
        if(index%20===0){
          for(let i=0;i<5;i++){svg.dispatchEvent(new KeyboardEvent('keydown',{key:'+',bubbles:true}));check(`zoom in ${index}/${i}`);}
          for(const key of ['ArrowLeft','ArrowUp','ArrowRight','ArrowDown']){svg.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));check(`pan ${index}/${key}`);}
          for(let i=0;i<8;i++){svg.dispatchEvent(new KeyboardEvent('keydown',{key:'-',bubbles:true}));check(`zoom out ${index}/${i}`);}
          svg.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));check(`fit ${index}`);
        }
      }
      // Coincident endpoints force the cramped-layout fallback.
      map.setChallenge({...challenges[0],to:challenges[0].from,toTitle:challenges[0].toTitle});check('coincident endpoints');
      map.setChallenge(challenges[4]);check('final fitted journey');
      return {checked,visibleNames,journeys:challenges.length,failures:failures.slice(0,12)};
    });
    reports.push({width,...report});
    assert.deepEqual(report.failures,[],`${width}px: map names must not overlap or clip`);
    assert.ok(report.visibleNames>=Math.min(400,report.journeys),'Station names should remain visible in ordinary fitted journeys');
    await page.screenshot({path:`test-results/${width}-map-labels.png`});await page.close();
  }
  console.log(JSON.stringify(reports,null,2));
} finally {
  await fs.mkdir('test-results',{recursive:true});
  await fs.writeFile('test-results/map-labels.json',JSON.stringify(reports,null,2));
  await browser.close();
}
