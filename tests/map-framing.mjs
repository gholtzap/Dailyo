import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const browser=await chromium.launch();
try {
  for(const width of [320,390,700,1440]){
    const page=await browser.newPage({viewport:{width,height:844}});
    await page.goto(new URL('/trainrot/',base).href);await page.locator('[data-route]').first().waitFor();
    const failures=await page.evaluate(async()=>{
      const [{createMap},network,boroughs,challenges]=await Promise.all([
        import('/map.js'),...['network','boroughs','challenges'].map(n=>fetch(`/data/${n}.json`).then(r=>r.json()))
      ]);
      const original=document.querySelector('.map-panel'),rect=original.getBoundingClientRect();
      const panel=document.createElement('div');panel.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;overflow:hidden`;
      panel.innerHTML='<div class="map-caption"><button>Show subway map</button></div><svg id="test-map"></svg>';
      document.body.append(panel);const svg=panel.querySelector('svg');svg.style.cssText='width:100%;height:100%;display:block';
      const map=createMap(svg,boroughs,network),failures=[];
      for(const c of challenges){map.setChallenge(c);const markers=[...panel.querySelectorAll('.map-marker')];if(markers.some(m=>m.hidden))failures.push(`${c.fromTitle} to ${c.toTitle}`);}
      panel.remove();return failures;
    });
    assert.deepEqual(failures,[],`${width}px: hidden endpoints`);
    console.log(`${width}px: all journeys show both endpoints`);await page.close();
  }
} finally {await browser.close();}
