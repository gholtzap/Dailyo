import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.TRAINROT_TEST_URL??'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true}),reports=[];
const view=async page=>(await page.locator('#city-map').getAttribute('viewBox')).split(' ').map(Number);
try{
  for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:width<700});
    const page=await context.newPage();await page.goto(new URL('/trainrot/',base).href);await page.locator('#reveal').waitFor();
    assert.equal(await page.locator('.map-controls').count(),0);
    const initial=await view(page),rect=await page.locator('#city-map').boundingBox();
    const x=rect.x+rect.width*.55,y=rect.y+rect.height*.5;
    const client=await context.newCDPSession(page);
    const point=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
    const touch=async(type,points)=>{await client.send('Input.dispatchTouchEvent',{type,touchPoints:points});await page.evaluate(()=>new Promise(requestAnimationFrame));};
    await touch('touchStart',[point(0,x-40,y),point(1,x+40,y)]);
    await touch('touchMove',[point(0,x-80,y),point(1,x+80,y)]);
    const pinched=await view(page);assert.ok(Math.abs(pinched[2]/initial[2]-.5)<.02,'Spread fingers zooms in');
    assert.equal(await page.evaluate(()=>visualViewport.scale),1,'Pinch zooms the map, not the page');
    // Keep the geographic point beneath the fingers fixed during a pinch.
    const world=(v)=>{const s=Math.min(rect.width/v[2],rect.height/v[3]);return [v[0]+(x-rect.x-(rect.width-v[2]*s)/2)/s,v[1]+(y-rect.y-(rect.height-v[3]*s)/2)/s];};
    world(initial).forEach((n,i)=>assert.ok(Math.abs(n-world(pinched)[i])<.01));
    await touch('touchEnd',[point(1,x+80,y)]);
    const beforePan=await view(page);await touch('touchMove',[point(0,x-50,y+20)]);const panned=await view(page);
    assert.equal(panned[2],beforePan[2]);assert.ok(panned[0]<beforePan[0]&&panned[1]<beforePan[1],'Remaining finger continues panning');
    await touch('touchEnd',[]);
    await touch('touchStart',[point(0,x-60,y),point(1,x+60,y)]);
    await touch('touchMove',[point(0,x-30,y),point(1,x+30,y)]);
    const out=await view(page);assert.ok(Math.abs(out[2]/panned[2]-2)<.02,'Pinching fingers together zooms out');
    await touch('touchCancel',[]);
    const cancelled=await view(page);await page.mouse.move(x+15,y+15);assert.deepEqual(await view(page),cancelled,'Cancelled touches cannot leave dragging active');
    await touch('touchStart',[point(0,x,y)]);await touch('touchMove',[point(0,x+25,y)]);await touch('touchEnd',[]);
    assert.notDeepEqual(await view(page),cancelled,'A new gesture works after cancellation');
    await page.locator('#city-map').focus();await page.keyboard.press('Home');assert.deepEqual(await view(page),initial);
    await page.keyboard.press('+');assert.ok((await view(page))[2]<initial[2]);await page.keyboard.press('Home');
    if(width<700){await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y);}else await page.mouse.dblclick(x,y);
    assert.ok((await view(page))[2]<initial[2],'Double tap or double click zooms in');await page.locator('#city-map').focus();await page.keyboard.press('Home');
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+30,y+20);await page.mouse.up();assert.notDeepEqual(await view(page),initial,'Mouse drag pans');
    await page.locator('#city-map').focus();for(let i=0;i<25;i++)await page.keyboard.press('+');assert.ok((await view(page))[2]>=140-1e-6);
    for(let i=0;i<25;i++)await page.keyboard.press('-');assert.ok((await view(page))[2]<=3000+1e-6);await page.keyboard.press('Home');
    await page.mouse.move(x,y);await page.mouse.wheel(0,-150);await page.waitForFunction(w=>Number(document.querySelector('#city-map').getAttribute('viewBox').split(' ')[2])<w,initial[2]);
    await page.locator('#city-map').focus();await page.keyboard.press('Home');assert.deepEqual(await view(page),initial);
    await page.screenshot({path:`test-results/${width}-map-gestures.png`});
    reports.push({width,pinchIn:true,pinchOut:true,focalPoint:true,panAfterPinch:true,cancellation:true,pageZoomUnchanged:true,keyboard:true,wheel:true,doubleTap:true,mouseDrag:true,zoomBounds:true});await context.close();
  }
  console.log(JSON.stringify(reports,null,2));
}finally{await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/map-gestures.json',JSON.stringify(reports,null,2));await browser.close();}
