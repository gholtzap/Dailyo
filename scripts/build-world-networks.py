"""Build frozen, auditable city rail graphs from Citylines or local GTFS feeds.
Citylines graphs use explicit distance-based puzzle times, not invented timetables.
"""
import collections, csv, datetime, hashlib, heapq, io, itertools, json, math, pathlib, re, sys, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/world'
OUT=ROOT/'dist/world-data'
YEAR=2026
CITIES=json.loads((ROOT/'scripts/world-cities.json').read_text())
PALETTE=['e53935','1976d2','388e3c','f9a825','8e24aa','00838f','ef6c00','c2185b','5d4037','546e7a']
def distance(a,b):
    return math.hypot((a[0]-b[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(a[1]-b[1])*111320)
def active(p):
    return p.get('opening') is not None and float(p['opening'])<=YEAR and float(p.get('closure') or 999999)>YEAR
def membership(m):
    return float(m.get('from') or 0)<=YEAR and float(m.get('to') or 999999)>YEAR
def color(s,index):
    s=(s or '').strip().lstrip('#')
    return s.lower() if re.fullmatch('[a-fA-F0-9]{6}',s) else PALETTE[index%len(PALETTE)]
def normalize(s): return re.sub(r'[^\w]+','',s.casefold())
def save(city,network):
    used={s for p in network['patterns'] for s in p['stations']}
    network['stations']={k:v for k,v in network['stations'].items() if k in used}
    routes={p['route'] for p in network['patterns']}
    network['routes']={k:v for k,v in network['routes'].items() if k in routes}
    if len(used)<3 or not routes: raise ValueError('Insufficient operating rail data')
    names=collections.Counter(s['name'] for s in network['stations'].values())
    for k,s in network['stations'].items():
        s['label']=s['name']+((' · '+k) if names[s['name']]>1 else '')
    version=hashlib.sha256(json.dumps(network,sort_keys=True).encode()).hexdigest()[:12]
    network['metadata'].update(city={k:city[k] for k in ['slug','name','country','lat','lon']},feedVersion=f"world-{city['slug']}-{version}",transferSeconds=240)
    target=OUT/city['slug'];target.mkdir(parents=True,exist_ok=True)
    (target/'network.json').write_text(json.dumps(network,ensure_ascii=False,separators=(',',':')))
    (target/'boroughs.json').write_text('{"type":"FeatureCollection","features":[]}')
    print(city['slug'],len(used),'stations',len(routes),'lines',len(network['patterns']),'patterns',flush=True)

def append_graph_patterns(network,route,sg,speed):
    stations=network['stations']
    paths=[];covered=set();remaining=set(sg)
    while remaining:
        root=min(remaining);component={root};todo=[root]
        while todo:
            for n in sg[todo.pop()]:
                if n not in component:component.add(n);todo.append(n)
        remaining-=component
        ends=sorted(n for n in component if len(sg[n])==1)
        starts=ends or [min(component)]
        if len(starts)>20:starts=starts[:20]
        for start in starts:
            queue=[(0,start)];costs={start:0};prev={}
            while queue:
                cost,u=heapq.heappop(queue)
                if cost!=costs[u]:continue
                for dest,w in sg[u].items():
                    if cost+w<costs.get(dest,1e20):costs[dest]=cost+w;prev[dest]=u;heapq.heappush(queue,(cost+w,dest))
            targets=ends if ends else sorted(component)
            for target in targets:
                if target==start or target not in costs:continue
                path=[target]
                while path[-1]!=start:path.append(prev[path[-1]])
                path.reverse()
                path_edges={tuple(sorted((a,b))) for a,b in zip(path,path[1:])}
                if not ends and path_edges<=covered:continue
                if ends and target<start:continue
                paths.append(path);covered|=path_edges
        for a in sorted(component):
            for b in sorted(sg[a]):
                edge=tuple(sorted((a,b)))
                if edge not in covered:paths.append([a,b]);covered.add(edge)
    for path in paths:
        for ids in [path,list(reversed(path))]:
            seconds=[max(35,round(sg[a][b]/speed+25)) for a,b in zip(ids,ids[1:])]
            network['patterns'].append(dict(route=route,stations=ids,seconds=seconds,geometry=[[stations[s]['lon'],stations[s]['lat']] for s in ids],offsets=list(range(len(ids))),headsign=stations[ids[-1]]['name']))

def citylines(city):
    source=city['sourceSlug'];base=json.loads((CACHE/f'{source}-base.json').read_text())
    systems={s['id']:s for s in base['systems']}
    lines={l['url_name']:l for l in base['lines'] if l.get('transport_mode_id') in [3,4,5,7,9] and not systems.get(l['system_id'],{}).get('historic')}
    station_features=[f for f in json.loads((CACHE/f'{source}-stations.json').read_text())['features'] if active(f['properties']) and distance(f['geometry']['coordinates'],[city['lon'],city['lat']])<90000]
    sections=[f for f in json.loads((CACHE/f'{source}-sections.json').read_text())['features'] if active(f['properties'])]
    stations={};by_name=collections.defaultdict(list);canonical={}
    for f in station_features:
        props=f['properties'];point=f['geometry']['coordinates'];key='s'+str(props['id']);name=props.get('name') or 'Station '+str(props['id'])
        old=next((k for k in by_name[normalize(name)] if distance([stations[k]['lon'],stations[k]['lat']],point)<180),None)
        canonical[key]=old or key
        if old: continue
        stations[key]=dict(id=key,name=name,label=name,area=city['name'],lon=point[0],lat=point[1])
        by_name[normalize(name)].append(key)
    network=dict(metadata=dict(source=f'https://www.citylines.co/{source}',license='ODbL-1.0',model='Estimated puzzle times from track distance, 25 seconds per stop and 4 minutes per transfer. Bidirectional topology model; no waits, timetables or live delays.',timeModel='estimated'),stations=stations,routes={},patterns=[])
    for number,(line_id,line) in enumerate(lines.items()):
        ls=[f for f in station_features if any(m.get('line_url_name')==line_id and membership(m) for m in f['properties'].get('lines',[]))]
        if len(ls)<2: continue
        shapes=[]
        for f in sections:
            if not any(m.get('line_url_name')==line_id and membership(m) for m in f['properties'].get('lines',[])): continue
            geom=f['geometry'];parts=[geom['coordinates']] if geom['type']=='LineString' else geom['coordinates']
            shapes.extend(p for p in parts if len(p)>1)
        if not shapes: continue
        cos=math.cos(math.radians(city['lat']));xy=lambda p:(p[0]*111320*cos,p[1]*111320)
        vertices=[];grid=collections.defaultdict(list)
        def vertex(point):
            x,y=xy(point);cell=(int(x//15),int(y//15))
            for dx in [-1,0,1]:
                for dy in [-1,0,1]:
                    for i in grid[cell[0]+dx,cell[1]+dy]:
                        if distance(point,vertices[i])<12:return i
            i=len(vertices);vertices.append(point);grid[cell].append(i);return i
        raw_edges={}
        for shape in shapes:
            for a,b in zip(shape,shape[1:]):
                ai,bi=vertex(a),vertex(b)
                if ai!=bi:raw_edges[tuple(sorted((ai,bi)))]=1
        if not raw_edges: continue
        edges=list(raw_edges);edge_xy=[(xy(vertices[a]),xy(vertices[b])) for a,b in edges]
        splits=collections.defaultdict(list)
        for f in ls:
            point=f['geometry']['coordinates'];px,py=xy(point);best=None
            for i,((ax,ay),(bx,by)) in enumerate(edge_xy):
                dx,dy=bx-ax,by-ay;t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)))
                dist=(px-ax-t*dx)**2+(py-ay-t*dy)**2
                if best is None or dist<best[0]:best=(dist,i,t)
            if best and best[0]<180**2:
                splits[best[1]].append((best[2],canonical['s'+str(f['properties']['id'])]))
        graph=collections.defaultdict(dict);station_at={};next_vertex=len(vertices)
        for i,(a,b) in enumerate(edges):
            chain=[(0,a),(1,b)]
            for t,sid in splits[i]:
                if t<.0001:v=a
                elif t>.9999:v=b
                else:v=next_vertex;next_vertex+=1
                station_at[v]=sid;chain.append((t,v))
            chain.sort()
            total=distance(vertices[a],vertices[b])
            for (t,u),(t2,v) in zip(chain,chain[1:]):
                if u==v:continue
                cost=max(.01,(t2-t)*total);graph[u][v]=min(graph[u].get(v,1e20),cost);graph[v][u]=min(graph[v].get(u,1e20),cost)
        # Traverse track geometry until the next station. Never jump across gaps.
        sg=collections.defaultdict(dict)
        for v,origin in station_at.items():
            queue=[(0,v)];costs={v:0}
            while queue:
                cost,u=heapq.heappop(queue)
                if cost!=costs[u]:continue
                other=station_at.get(u)
                if other and other!=origin:
                    sg[origin][other]=min(sg[origin].get(other,1e20),cost);continue
                for dest,w in graph[u].items():
                    new=cost+w
                    if new<costs.get(dest,1e20):costs[dest]=new;heapq.heappush(queue,(new,dest))
        if not sg:continue
        route='r'+re.match(r'\d+',line_id).group() if re.match(r'\d+',line_id) else 'r'+str(number)
        network['routes'][route]=dict(name=line['name'].strip(),color=color(line.get('color'),number),system=systems.get(line['system_id'],{}).get('name',''))
        # Terminal-to-terminal paths preserve branches. Extra paths cover rings and
        # any edges not reached from a terminus, rather than flattening a branch.
        append_graph_patterns(network,route,sg,{3:14,4:10,5:8,7:7,9:6}[line['transport_mode_id']])
    return network

def gtfs(city,feed):
    archive=zipfile.ZipFile(CACHE/(feed['file']+'-rail.zip'))
    names={pathlib.PurePosixPath(n).name:n for n in archive.namelist()}
    def rows(name):
        if name not in names:return []
        return csv.DictReader(io.TextIOWrapper(archive.open(names[name]),encoding='utf-8-sig'),skipinitialspace=True)
    def sec(value):
        h,m,s=map(int,value.split(':'));return h*3600+m*60+s
    stops={s['stop_id']:s for s in rows('stops.txt')}
    def parent(s):return stops[s].get('parent_station') or s
    def point(s):return [float(s['stop_lon']),float(s['stop_lat'])]
    radius=feed.get('radius',55000)
    near={k for k,s in stops.items() if s.get('stop_lon') and s.get('stop_lat') and distance(point(s),[city['lon'],city['lat']])<radius}
    rail_types={0,1,2,5,6,7,12,100,101,102,103,105,106,109,200,400,401,402,403,404,405,900,901,902,903,904,905,906,907}
    routes={r['route_id']:r for r in rows('routes.txt') if int(r.get('route_type') or -1) in rail_types and (not feed.get('agency') or r.get('agency_id') in feed['agency'])}
    # Freeze a representative Wednesday supported by the feed calendar.
    calendars=list(rows('calendar.txt'));dates=list(rows('calendar_dates.txt'))
    today=datetime.date(2026,11,18)
    if calendars:
        lo=min(datetime.datetime.strptime(c['start_date'],'%Y%m%d').date() for c in calendars)
        hi=max(datetime.datetime.strptime(c['end_date'],'%Y%m%d').date() for c in calendars)
        today=max(lo,min(today,hi))
        for offset in range(7):
            candidate=today+datetime.timedelta(days=offset)
            if candidate<=hi and candidate.weekday()==2:today=candidate;break
    if not calendars and dates:
        candidates=[datetime.datetime.strptime(c['date'],'%Y%m%d').date() for c in dates if c['exception_type']=='1']
        weekdays=[d for d in candidates if d.weekday()==2]
        if candidates:today=min(weekdays or candidates,key=lambda d:abs((d-today).days))
    date=today.strftime('%Y%m%d');weekday=today.strftime('%A').lower()
    services={c['service_id'] for c in calendars if c.get(weekday)=='1' and c['start_date']<=date<=c['end_date']}
    for c in dates:
        if c['date']==date:
            if c['exception_type']=='1':services.add(c['service_id'])
            else:services.discard(c['service_id'])
    trips={t['trip_id']:t for t in rows('trips.txt') if t['route_id'] in routes and t['service_id'] in services}
    # Keep all rail trip stop orders first; discard any trip outside the city.
    entries=collections.defaultdict(list)
    for s in rows('stop_times.txt'):
        if s['trip_id'] in trips:
            try:entries[s['trip_id']].append((int(s['stop_sequence']),s['stop_id'],sec(s.get('arrival_time') or s['departure_time']),sec(s.get('departure_time') or s['arrival_time'])))
            except (ValueError,KeyError):pass
    groups=collections.defaultdict(list)
    for tid,es in entries.items():
        es.sort()
        if not es or not 9*3600<=es[0][3]<17*3600:continue
        segments=[];current=[]
        for e in es:
            if e[1] in near:current.append(e)
            else:
                if len(current)>1:segments.append(current)
                current=[]
        if len(current)>1:segments.append(current)
        for segment in segments:
            ids=tuple(parent(e[1]) for e in segment)
            durations=[max(15,b[2]-a[3]) for a,b in zip(segment,segment[1:])]
            if any(v>3600 for v in durations):continue
            groups[trips[tid]['route_id'],ids].append((tid,durations))
    stations={};patterns=[];output_routes={};canonical={};by_name=collections.defaultdict(list)
    for rid,ids in groups:
        for sid in ids:
            if sid in canonical:continue
            s=stops[sid];pt=point(s);name=s['stop_name'];old=next((k for k in by_name[normalize(name)] if distance([stations[k]['lon'],stations[k]['lat']],pt)<130),None)
            key=old or 's'+str(len(stations));canonical[sid]=key
            if not old:stations[key]=dict(id=key,name=name,label=name,area=city['name'],lon=pt[0],lat=pt[1]);by_name[normalize(name)].append(key)
    for (rid,ids),samples in groups.items():
        # Minor special runs do not become puzzle shortcuts.
        if len(samples)<2:continue
        route='r'+str(list(routes).index(rid));r=routes[rid]
        output_routes[route]=dict(name=r.get('route_short_name') or r.get('route_long_name') or rid,color=({'GRN':'00ab66','YEL':'ffd500'}.get(r.get('route_short_name')) if city['slug']=='newcastle' else None) or color(r.get('route_color'),len(output_routes)))
        mapped=[canonical[s] for s in ids]
        durations=[round(sorted(s[1][i] for s in samples)[len(samples)//2]) for i in range(len(ids)-1)]
        patterns.append(dict(route=route,stations=mapped,seconds=durations,geometry=[[stations[s]['lon'],stations[s]['lat']] for s in mapped],offsets=list(range(len(mapped))),headsign=stations[mapped[-1]]['name']))
    return dict(metadata=dict(source=feed['url'],license=feed.get('license','See source terms'),model='Median scheduled running times for daytime rail patterns; 4 minutes per transfer. No initial wait or live delays.',timeModel='scheduled',serviceDate=date),stations=stations,routes=output_routes,patterns=patterns)

if __name__=='__main__':
    feeds=json.loads((ROOT/'scripts/world-gtfs.json').read_text()) if (ROOT/'scripts/world-gtfs.json').exists() else {}
    selected=set(sys.argv[1:]);errors=[]
    for city in CITIES:
        slug=city['slug']
        if slug=='nyc' or (selected and slug not in selected):continue
        try:
            net=gtfs(city,feeds[slug]) if slug in feeds else citylines(city)
            save(city,net)
        except Exception as e:errors.append((slug,str(e)));print('FAILED',slug,repr(e),flush=True)
    print('Failures:',errors,flush=True)
    if errors:sys.exit(1)
