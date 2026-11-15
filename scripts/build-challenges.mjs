import fs from 'node:fs';
import { createRouter } from '../dist/router.js';
const data = JSON.parse(fs.readFileSync(new URL('../dist/data/network.json',import.meta.url)));
const router = createRouter(data);
const original=JSON.parse(fs.readFileSync(new URL('./original-challenges.json',import.meta.url)));

const places = [
  ['L08','Bedford Avenue','Williamsburg'], ['A24','Columbus Circle','Manhattan'],
  ['R31','Atlantic Av–Barclays Ctr','Downtown Brooklyn'], ['901','Grand Central','Midtown East'],
  ['G22','Court Square','Long Island City'], ['R20','Union Square','Manhattan'],
  ['M18','Delancey–Essex','Lower East Side'], ['D11','Yankee Stadium','The Bronx'],
  ['G14','Jackson Heights–Roosevelt Av','Queens'], ['R16','Times Square','Midtown'],
  ['D21','Broadway–Lafayette','NoHo'], ['L01','14 St–Eighth Avenue','West Village'],
  ['A27','42 St–Port Authority','Midtown West'], ['M08','Myrtle–Wyckoff','Bushwick'],
  ['G28','Nassau Avenue','Greenpoint'], ['R11','Lexington Av–59 St','Upper East Side'],
  ['A15','125 St–St Nicholas Av','Harlem'], ['R28','Court Street','Brooklyn Heights'],
  ['D24','Atlantic Av–Barclays Ctr','Downtown Brooklyn'], ['A41','Jay St–MetroTech','Downtown Brooklyn'],
  ['A32','West 4 St','Greenwich Village'], ['G24','21 Street','Long Island City'],
  ['117','Columbia University','Morningside Heights'], ['124','Lincoln Center','Upper West Side'],
  ['128','Penn Station–Seventh Avenue','Midtown'], ['A28','Penn Station–Eighth Avenue','Midtown'],
  ['A21','Museum of Natural History','Upper West Side'], ['A09','168 Street–Washington Heights','Washington Heights'],
  ['D13','145 Street–St Nicholas Avenue','Harlem'], ['D15','Rockefeller Center','Midtown'],
  ['R17','Herald Square','Midtown'], ['M21','Brooklyn Bridge–City Hall','Lower Manhattan'],
  ['M22','Fulton Street','Lower Manhattan'], ['R25','World Trade Center','Lower Manhattan'],
  ['142','South Ferry','Lower Manhattan'], ['Q03','72 Street–Second Avenue','Upper East Side'],
  ['Q04','86 Street–Second Avenue','Upper East Side'], ['R01','Astoria–Ditmars Boulevard','Astoria'],
  ['R09','Queensboro Plaza','Long Island City'], ['G08','Forest Hills–71 Avenue','Forest Hills'],
  ['G11','Woodhaven Boulevard–Queens Boulevard','Elmhurst'], ['G19','Steinway Street','Astoria'],
  ['G21','Queens Plaza','Long Island City'], ['B04','21 Street–Queensbridge','Long Island City'],
  ['B06','Roosevelt Island','Roosevelt Island'], ['701','Flushing–Main Street','Flushing'],
  ['702','Mets–Willets Point','Queens'], ['712','61 Street–Woodside','Woodside'],
  ['G05','Jamaica Center','Jamaica'], ['G06','Sutphin Boulevard–JFK Airport','Jamaica'],
  ['F06','Kew Gardens–Union Turnpike','Kew Gardens'], ['D05','Fordham Road–Grand Concourse','The Bronx'],
  ['407','Fordham Road–Jerome Avenue','The Bronx'], ['213','East 180 Street','The Bronx'],
  ['608','Parkchester','The Bronx'], ['237','Grand Army Plaza','Brooklyn'],
  ['238','Brooklyn Museum','Brooklyn'], ['250','Crown Heights–Utica Avenue','Brooklyn'],
  ['247','Flatbush Avenue–Brooklyn College','Brooklyn'], ['A42','Hoyt–Schermerhorn','Downtown Brooklyn'],
  ['A48','Utica Avenue–Fulton Street','Brooklyn'], ['L22','Broadway Junction','Brooklyn'],
  ['L10','Metropolitan Avenue–Lorimer Street','Williamsburg'], ['G26','Greenpoint Avenue','Greenpoint'],
  ['G33','Bedford–Nostrand Avenues','Bedford-Stuyvesant'], ['M16','Marcy Avenue','Williamsburg'],
  ['M11','Myrtle Avenue–Broadway','Brooklyn'], ['F18','York Street','DUMBO'],
  ['F21','Carroll Street','Carroll Gardens'], ['F22','Smith–9 Streets','Brooklyn'],
  ['R33','Fourth Avenue–9 Street','Park Slope'], ['D26','Prospect Park','Brooklyn'],
  ['D43','Coney Island–Stillwell Avenue','Coney Island'], ['D40','Brighton Beach','Brooklyn'],
  ['R45','Bay Ridge–95 Street','Bay Ridge'], ['G10','63 Drive–Rego Park','Rego Park'],
  ['M01','Middle Village–Metropolitan Avenue','Middle Village'],
];
const resolved = [];
for (const [member,title,area] of places) {
  const station = Object.values(data.stations).find(s=>s.members.includes(member));
  if (station && !resolved.some(s=>s.id===station.id)) resolved.push({id:station.id,title,area});
}
const challenges = original.map(c=>({...c,...(c.difficulty==='easy'?{daily:true}:{})}));
const existing = new Set(challenges.map(c=>`${c.from}:${c.to}`));
const familiar = new Set(['Times Square','Grand Central','Union Square','Columbus Circle','42 St–Port Authority','Atlantic Av–Barclays Ctr','Yankee Stadium','West 4 St','Penn Station–Seventh Avenue','Penn Station–Eighth Avenue','Rockefeller Center','Herald Square','Brooklyn Bridge–City Hall','Fulton Street','World Trade Center','South Ferry','Lincoln Center','Museum of Natural History','Columbia University','Grand Army Plaza','Brooklyn Museum','Prospect Park','Flushing–Main Street','Coney Island–Stillwell Avenue','Roosevelt Island','Bedford Avenue','Court Square','Delancey–Essex','Jackson Heights–Roosevelt Av','Broadway–Lafayette','14 St–Eighth Avenue','Jay St–MetroTech','Court Street','Myrtle–Wyckoff','Lexington Av–59 St']);
const distance=(a,b)=>Math.hypot((a[0]-b[0])*Math.cos((a[1]+b[1])*Math.PI/360),a[1]-b[1])*111.2;
for (const from of resolved) for (const to of resolved) {
  if (from.id===to.id || existing.has(`${from.id}:${to.id}`)) continue;
  const best=router.best(from.id,to.id);
  const stops=best?.legs.reduce((sum,l)=>sum+l.stops,0) ?? 0;
  if(!best || best.seconds<12*60 || best.seconds>35*60 || stops<4 || best.legs.length>3)continue;
  if(best.legs.length===1&&new Set(router.rides(from.id).map(l=>l.route)).size<2)continue;
  if(new Set(best.legs.map(l=>l.route)).size!==best.legs.length)continue;
  const a=data.stations[from.id],b=data.stations[to.id],straight=distance([a.lon,a.lat],[b.lon,b.lat]);
  if(straight<1.6)continue;
  let length=0,clear=true;const visited=new Set([from.id]);
  for(const leg of best.legs){
    const p=data.patterns[leg.patternIndex],geometry=p.geometry.slice(p.offsets[leg.start],p.offsets[leg.end]+1);
    if(!p.headsign||geometry.length<2)clear=false;
    for(const id of p.stations.slice(leg.start+1,leg.end+1)){if(visited.has(id))clear=false;visited.add(id);}
    for(let i=1;i<geometry.length;i++)length+=distance(geometry[i-1],geometry[i]);
  }
  if(!clear||length/straight>2.5)continue;
  const familiarCount=Number(familiar.has(from.title))+Number(familiar.has(to.title));
  const difficulty=best.legs.length===1&&familiarCount===2?'easy':best.legs.length===1||best.legs.length===2&&familiarCount>=1?'medium':'hard';
  challenges.push({from:from.id,to:to.id,fromTitle:from.title,toTitle:to.title,fromArea:from.area,toArea:to.area,difficulty});
}
fs.writeFileSync(new URL('../dist/data/challenges.json',import.meta.url),JSON.stringify(challenges));
console.log(`${challenges.length} puzzles; ${challenges.length-original.length} added.`);
