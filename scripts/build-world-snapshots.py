"""Use published agency-derived station/adjacency snapshots, with their source credits.
No application code or artwork from the source project is used.
"""
import collections,concurrent.futures,hashlib,importlib.util,json,math,pathlib,re,time,urllib.request,sys
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=ROOT/'.cache/world'
spec=importlib.util.spec_from_file_location('world',ROOT/'scripts/build-world-networks.py');world=importlib.util.module_from_spec(spec);spec.loader.exec_module(world)
def fetch(url,path):
 if path.exists():
  try:return json.loads(path.read_text())
  except ValueError:pass
 for attempt in range(4):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Dailyo-Trainrot-World/1.0'}),timeout=60) as response:d=json.load(response)
   path.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')));return d
  except Exception:
   if attempt==3:raise
   time.sleep(attempt+1)
commit=json.loads((ROOT/'scripts/world-snapshot-version.json').read_text())['commit']
config_path=CACHE/'tinytrains-cities.ts'
if not config_path.exists():
 with urllib.request.urlopen(f'https://raw.githubusercontent.com/liminalapps/tinytrains/{commit}/shared/cities.ts',timeout=30) as response:config_path.write_bytes(response.read())
config=config_path.read_text()
origins={m[1]:json.loads('['+m[2]+']') for m in re.finditer(r"\bid: '([^']+)',.*?origin: \[([^\]]+)\]",config,re.S)}
aliases={'san-francisco':'sf','washington-dc':'washington','hong-kong':'hongkong','mexico-city':'mexicocity','sao-paulo':'saopaulo'}
selected=set(sys.argv[1:]);cities=[c for c in world.CITIES if c['slug']!='nyc' and aliases.get(c['slug'],c['slug']) in origins and (not selected or c['slug'] in selected)]
def build(city):
 slug=city['slug'];key=aliases.get(slug,slug);base=f'https://raw.githubusercontent.com/liminalapps/tinytrains/{commit}/public/data/{key}/'
 d=fetch(base+'transit.json',CACHE/f'tinytrains-{key}.json');origin=origins[key]
 # The source's equirectangular projection uses Earth's mean radius.
 scale=math.pi*6371008.8/180;cos=math.cos(math.radians(origin[1]))
 def lonlat(x,y):return [round(origin[0]+x/(scale*cos),6),round(origin[1]+y/scale,6)]
 stations={};canonical={};by_name=collections.defaultdict(list)
 for station in d['stations']:
  point=lonlat(station['x'],station['y']);name=station['name'];old=next((k for k in by_name[world.normalize(name)] if world.distance([stations[k]['lon'],stations[k]['lat']],point)<180),None)
  sid=old or 's'+str(len(stations));canonical[station['id']]=sid
  if not old:stations[sid]=dict(id=sid,name=name,label=name,area=city['name'],lon=point[0],lat=point[1]);by_name[world.normalize(name)].append(sid)
 network=dict(metadata=dict(source=f'https://github.com/liminalapps/tinytrains/tree/{commit}/public/data/{key}',attribution=d['attribution'],license='Underlying operator open-data terms; OpenStreetMap-derived geometry: ODbL-1.0',sourceBuilt=d['built'],sourceCommit=commit,timeModel='estimated',model='Estimated puzzle times from mapped distance, 25 seconds per stop and 4 minutes per transfer. Bidirectional topology model; no waits, timetables or live delays.'),stations=stations,routes={},patterns=[])
 for index,line in enumerate(d['lines']):
  graph=collections.defaultdict(dict)
  for segment in d['segments']:
   if line['id'] not in segment['lines']:continue
   a,b=canonical.get(segment['from']),canonical.get(segment['to'])
   if not a or not b or a==b:continue
   pts=segment['pts'];length=sum(math.hypot(pts[i+2]-pts[i],pts[i+3]-pts[i+1]) for i in range(0,len(pts)-2,2))
   length=max(length,world.distance([stations[a]['lon'],stations[a]['lat']],[stations[b]['lon'],stations[b]['lat']]))
   graph[a][b]=min(graph[a].get(b,1e20),length);graph[b][a]=min(graph[b].get(a,1e20),length)
  route='r'+str(index);network['routes'][route]=dict(name=line.get('short') or line['name'],title=line['name'],color=world.color(line['color'],index),system=line['system'])
  world.append_graph_patterns(network,route,graph,{'rail':14,'tram':6,'light':8}.get(line['kind'],10))
 world.save(city,network)
 try:
  geo=fetch(base+'geo.json',CACHE/f'tinytrains-{key}-geo.json');features=[]
  for kind in ['water','parks']:
   for polygon in geo.get(kind,[]):
    rings=[[lonlat(ring[i],ring[i+1]) for i in range(0,len(ring),2)] for ring in polygon]
    if rings and len(rings[0])>2:features.append(dict(type='Feature',properties=dict(kind='water' if kind=='water' else 'park'),geometry=dict(type='MultiPolygon',coordinates=[rings])))
  (world.OUT/slug/'boroughs.json').write_text(json.dumps(dict(type='FeatureCollection',features=features),separators=(',',':')))
 except Exception as e:print('Basemap unavailable',slug,str(e),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(build,cities))
