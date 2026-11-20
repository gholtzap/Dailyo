import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

// Run with the staged NYC data, or point these inputs at a production snapshot.
const network=JSON.parse(await fs.readFile(process.env.TRAINROT_NYC_NETWORK??'dist/data/network.json'));
const challenges=JSON.parse(await fs.readFile(process.env.TRAINROT_NYC_CHALLENGES??'dist/data/challenges.json'));
assert.ok(network.stations['901']&&network.stations.G24&&network.stations.B04,'This check requires the NYC dataset.');
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const browser=await chromium.launch(),receipts=[];
await fs.mkdir('test-results',{recursive:true});
try{
 for(const width of [390,1440])for(const [to,correct]of [['G24',true],['B04',false]]){
  const challenge=challenges.find(c=>c.from==='901'&&c.to===to)??{
   from:'901',to,fromTitle:'Grand Central',toTitle:network.stations[to].label,
   fromArea:'Midtown East',toArea:'Queens',difficulty:'easy',
  };
  const page=await browser.newPage({viewport:{width,height:844},colorScheme:'dark',reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/data/network.json',r=>r.fulfill({json:network}));
  await page.route('**/data/challenges.json',r=>r.fulfill({json:[challenge]}));
  await page.goto(`${base}/rush/trainrot/`);
  const train=page.frameLocator('iframe[title="trainrot"]');
  await train.locator('#reveal').waitFor();
  assert.deepEqual(await train.locator('.endpoint strong').allTextContents(),[challenge.fromTitle,challenge.toTitle]);
  assert.match(await train.locator('#city-map').getAttribute('aria-label'),/lines are hidden/);
  assert.equal(await train.locator('.map-hint').count(),0);
  assert.equal(await train.locator('#city-map path[opacity]').count(),0);
  await train.locator('[data-route="7"]').click();
  await train.locator('[data-route="G"]').click();
  await train.locator('#reveal').click();
  const verdict=correct?'Correct':'Missed';
  await page.locator('#rush-status').filter({hasText:verdict}).waitFor();
  if(correct)await train.getByRole('heading',{name:'Correct · Your route'}).waitFor();
  await page.screenshot({path:`test-results/${width}-grand-central-${to}.png`});
  assert.deepEqual(errors,[]);
  receipts.push({width,feedVersion:network.metadata.feedVersion,from:challenge.fromTitle,to:challenge.toTitle,sequence:['7','G'],expected:verdict,actual:await page.locator('#rush-status').textContent()});
  if(correct){
   await page.goto(`${base}/trainrot/`);
   await page.locator('#reveal').waitFor();
   assert.equal(await page.locator('.map-hint').count(),0);
   await page.locator('[data-route="7"]').click();
   await page.locator('[data-route="G"]').click();
   await page.locator('#reveal').click();
   await page.locator('.result-score').filter({hasText:'100 points'}).waitFor();
   await page.reload();
   await page.locator('.result-score').filter({hasText:'100 points'}).waitFor();
  }
  await page.close();
 }
 console.log('390px and 1440px: 7 → G earns full credit to 21 St, and fails to reach 21 St–Queensbridge; NYC network stays hidden.');
}finally{
 await browser.close();
 await fs.writeFile('test-results/nyc-route-feedback.json',JSON.stringify(receipts,null,2));
}
