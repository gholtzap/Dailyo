import {chromium} from 'playwright';
process.env.TRAINROT_TEST_URL??='http://localhost:4175';
const launch=chromium.launch.bind(chromium);
chromium.launch=options=>launch({...options,args:[...(options?.args??[]),'--no-proxy-server']});
for(const name of ['daily','map-hint','demo-game','map-labels','map-framing','map-gestures','dark-theme'])await import(`./${name}.mjs`);
