import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true}),reports=[];
try{
  for(const width of [390,1440])for(const colorScheme of ['light','dark']){
    const page=await browser.newPage({viewport:{width,height:844},colorScheme});
    await page.goto(process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173');await page.locator('#reveal').waitFor();
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#1c1d1f');
    const actual=await page.evaluate(()=>({scheme:getComputedStyle(document.documentElement).colorScheme,background:getComputedStyle(document.querySelector('.planner')).backgroundColor,land:getComputedStyle(document.querySelector('#city-map path')).fill,water:getComputedStyle(document.querySelector('.map-panel')).backgroundColor}));
    assert.deepEqual(actual,{scheme:'dark',background:'rgb(28, 29, 31)',land:'rgb(41, 43, 46)',water:'rgb(21, 25, 29)'});
    await page.getByRole('button',{name:'How to play',exact:true}).click();
    assert.equal(await page.locator('#help-dialog').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(28, 29, 31)');
    await page.keyboard.press('Escape');await page.screenshot({path:`test-results/${width}-${colorScheme}-dark-default.png`,fullPage:true});
    reports.push({width,systemPreference:colorScheme,...actual});await page.close();
  }
  console.log(JSON.stringify(reports,null,2));
}finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/dark-theme.json',JSON.stringify(reports,null,2));await browser.close();}
