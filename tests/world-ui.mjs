import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkPage} from 'lintapple';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const policy=JSON.parse(await fs.readFile(new URL('../ui-policy.json',import.meta.url)));
const browser=await chromium.launch(),reports=[];
try{
 for(const kind of ['flags','languages'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:844},colorScheme:'dark'});await page.goto(`${base}/${kind}/`);await page.locator('.choice').first().waitFor();
  const inspect=async state=>{const report=await checkPage(page,policy);reports.push({name:`${kind}-${width}-${state}`,...report});console.log(`${kind} ${width} ${state}: ${report.findings.length} findings`);};
  await inspect('question');await page.locator('.choice').first().click();await page.locator('#next').waitFor({state:'visible'});await inspect('answer');
  for(let i=1;i<5;i++){await page.locator('#next').click();await page.locator('.choice').first().click();}
  await page.locator('#next').click();await page.locator('.result h2').waitFor();await inspect('result');await page.getByRole('button',{name:'Play practice'}).click();await page.locator('.choice').first().waitFor();await inspect('practice');await page.close();
 }
}finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/world-ui.json',JSON.stringify(reports,null,2));await browser.close();}
if(reports.some(r=>r.findings.length))process.exitCode=1;
