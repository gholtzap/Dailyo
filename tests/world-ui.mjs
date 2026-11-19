import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
const policy=JSON.parse(fs.readFileSync(new URL('../ui-policy.json',import.meta.url)));
const cities=JSON.parse(fs.readFileSync(new URL('../scripts/world-cities.json',import.meta.url)));
const selected=new Set(process.argv.slice(2));
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4175';
const browser=await chromium.launch({args:['--no-proxy-server']});
const reports=[];fs.mkdirSync('test-results/world',{recursive:true});
try{
 for(const viewport of policy.viewports){
  const page=await browser.newPage({viewport,colorScheme:'dark',reducedMotion:'reduce'});
  await page.clock.setFixedTime(new Date('2026-11-18T17:00:00Z'));
  async function inspect(city,state){
   const report=await checkPage(page,policy);reports.push({city,state,viewport,theme:'dark',url:page.url(),...report});
   fs.writeFileSync('test-results/world/ui-policy.json',JSON.stringify({command:'node tests/world-ui.mjs',reports},null,2));
   console.log(`${viewport.width}px ${city} ${state}: ${report.findings.length} findings`);
   if(report.findings.length)console.log(JSON.stringify(report.findings.slice(0,12),null,2));
   assert.equal(report.findings.length,0,`${city} ${state}: UI policy findings`);
  }
  for(const city of cities){
   if(selected.size&&!selected.has(city.slug))continue;
   await page.goto(new URL(`/trainrot-world/${city.slug}/`,base).href);await page.locator('[data-route]').first().waitFor();
   await inspect(city.slug,'daily');
   await page.getByRole('button',{name:'Show answer',exact:true}).click();await page.locator('#start-practice').waitFor();
   await inspect(city.slug,'answer');
   if(['nyc','london','tokyo'].includes(city.slug)){
    await page.locator('#change-city').click();await page.locator('#world-city-dialog').waitFor();await inspect(city.slug,'city picker');
    await page.locator('#city-search').fill('zzzzzz');await page.getByText('No cities found. Try another name or country.').waitFor();await inspect(city.slug,'empty city search');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#world-city-dialog').isVisible(),false);
    await page.getByRole('button',{name:'How to play',exact:true}).click();await page.locator('#help-dialog').waitFor();await inspect(city.slug,'help');await page.locator('#help-dialog').getByRole('button',{name:'Close',exact:true}).click();
   }
  }
  await page.close();
 }
 console.log(`UI policy passed for ${reports.length} rendered states. Report: test-results/world/ui-policy.json`);
}finally{await browser.close();}
