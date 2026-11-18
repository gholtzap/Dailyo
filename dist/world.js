import {seededDeck} from './daily/puzzles.js';
export function worldDailyChallenge(challenges,date,slug){
 const deck=seededDeck(`trainrot-world-daily-v1:${slug}`,challenges);
 const day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
 return deck[((day%deck.length)+deck.length)%deck.length];
}
export async function configureWorld(){
 const slug=document.body.dataset.worldCity;
 if(!slug)return null;
 if(location.pathname.replace(/\/$/,'')==='/trainrot-world'){
  location.replace('/trainrot-world/nyc/'+location.search);return new Promise(()=>{});
 }
 const response=await fetch('/world-data/cities.json');
 if(!response.ok)throw new Error('City list did not load');
 const cities=await response.json(),city=cities.find(c=>c.slug===slug);
 if(!city)throw new Error('Unknown city');
 const bar=document.createElement('section');bar.className='world-bar';bar.setAttribute('aria-label','Choose a city');
 const heading=document.createElement('div');
 const title=document.createElement('h1');title.textContent=city.name;
 const subtitle=document.createElement('p');subtitle.textContent=`trainrot world · ${city.country}`;
 heading.append(subtitle,title);
 const change=document.createElement('button');change.id='change-city';change.className='secondary-button';change.textContent='Change city';change.setAttribute('aria-haspopup','dialog');
 bar.append(heading,change);document.querySelector('.site-header').before(bar);
 const dialog=document.createElement('dialog');dialog.id='world-city-dialog';dialog.className='world-city-dialog';dialog.setAttribute('aria-labelledby','world-cities-title');
 dialog.innerHTML='<div class="world-dialog-heading"><h2 id="world-cities-title">Choose your city</h2><form method="dialog"><button type="submit" aria-label="Close city picker">Close</button></form></div><label for="city-search">Search cities or countries</label><input id="city-search" type="search" placeholder="Search 98 cities…" autocomplete="off"><p id="city-count" role="status"></p><ul id="city-results"></ul>';
 document.body.append(dialog);
 const search=dialog.querySelector('input'),list=dialog.querySelector('ul'),count=dialog.querySelector('#city-count');
 const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function render(){
  const term=normalize(search.value.trim());list.replaceChildren();
  const matches=cities.filter(c=>normalize(`${c.name} ${c.country} ${c.slug} ${c.slug==='nyc'?'New York NYC':''}`).includes(term)).sort((a,b)=>a.name.localeCompare(b.name));
  count.textContent=`${matches.length} ${matches.length===1?'city':'cities'}`;
  for(const item of matches){
   const li=document.createElement('li'),link=document.createElement('a'),name=document.createElement('strong'),country=document.createElement('span');
   link.href=`/trainrot-world/${item.slug}/`;name.textContent=item.name;country.textContent=item.country;
   if(item.slug===slug)link.setAttribute('aria-current','page');
   link.append(name,country);li.append(link);list.append(li);
  }
  if(!matches.length){const li=document.createElement('li');li.className='world-no-results';li.textContent='No cities found. Try another name or country.';list.append(li);}
 }
 change.onclick=()=>{search.value='';render();dialog.showModal();search.focus();};search.oninput=render;
 search.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();dialog.close();return;}if(event.key==='Enter'){const links=list.querySelectorAll('a');if(links.length===1)links[0].click();}if(event.key==='ArrowDown'){event.preventDefault();list.querySelector('a')?.focus();}};
 dialog.onclick=event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}};
 dialog.addEventListener('close',()=>change.focus());
 try{localStorage.setItem('trainrot-world-city',slug);}catch{}
 const help=document.querySelector('#help-dialog');
 const note=document.createElement('p');note.textContent='Each city has its own daily journey and saved practice. Daily journeys reset at midnight in New York.';help.append(note);
 return {city,cities};
}
export function describeWorldNetwork(world,network){
 const help=document.querySelector('#help-dialog');
 const model=document.createElement('p');model.textContent=network.metadata.model??'Scheduled running times, with four minutes per transfer. No live delays.';help.append(model);
 const scope=document.createElement('p');scope.textContent=`This puzzle network contains ${Object.keys(network.stations).length} stations and ${Object.keys(network.routes).length} lines. Maps are schematic. Coverage follows the published snapshot, which may omit some operators or services.`;help.append(scope);
 const credits=document.createElement('p');credits.className='world-credits';
 const link=document.createElement('a');link.href=network.metadata.source??'https://www.mta.info/developers';link.textContent='Network source';link.target='_blank';link.rel='noopener';credits.append(link,document.createTextNode(' · '));
 const license=document.createElement('a');license.href='/trainrot-world/sources/';license.textContent='Data credits and timing models';credits.append(license);help.append(credits);
 for(const text of network.metadata.attribution??[]){const p=document.createElement('p');p.className='world-credits';p.textContent=text;help.append(p);}
 const note=document.createElement('div');note.className='world-map-note';
 const a=document.createElement('a');a.href='/trainrot-world/sources/';a.textContent=network.metadata.timeModel==='estimated'?'Schematic map · Estimated puzzle times':'Schematic map · Scheduled puzzle times';note.append(a);if(network.metadata.attribution?.some(text=>text.includes('OpenStreetMap'))){const credit=document.createElement('a');credit.href='https://www.openstreetmap.org/copyright';credit.textContent='© OpenStreetMap contributors';credit.target='_blank';credit.rel='noopener';note.append(document.createTextNode(' '),credit);}document.querySelector('.map-panel').append(note);
 const first=help.querySelector('p');if(first)first.textContent='Find the fastest route from A to B in this city’s puzzle network.';
}
