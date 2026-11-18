"""Download source GTFS and cache rail-only tables without unpacking national feeds."""
import concurrent.futures,csv,io,json,pathlib,time,urllib.request,zipfile,sys
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=ROOT/'.cache/world'
feeds={f['file']:f for f in json.loads((ROOT/'scripts/world-gtfs.json').read_text()).values()}
def prepare(key):
 f=feeds[key];raw=CACHE/(key+'.zip');dest=CACHE/(key+'-rail.zip')
 if dest.exists() and zipfile.is_zipfile(dest):print('Ready',key,flush=True);return
 if not raw.exists() or not zipfile.is_zipfile(raw):
  for attempt in range(3):
   try:
    print('Downloading GTFS',key,flush=True)
    with urllib.request.urlopen(urllib.request.Request((f.get('fallback') if attempt==2 and f.get('fallback') else f['url']),headers={'User-Agent':'Dailyo-Trainrot-World/1.0'}),timeout=150) as response,raw.open('wb') as out:
     while block:=response.read(1024*1024):out.write(block)
    if not zipfile.is_zipfile(raw):raise ValueError('Not a GTFS archive: '+key)
    break
   except Exception:
    if attempt==2:raise
    time.sleep(2)
 z=zipfile.ZipFile(raw);names={pathlib.PurePosixPath(n).name:n for n in z.namelist()}
 types=set(f.get('types',[0,1,2,5,6,7,12,100,101,102,103,105,106,109,200,400,401,402,403,404,405,900,901,902,903,904,905,906,907]))
 def rows(name):return csv.reader(io.TextIOWrapper(z.open(names[name]),encoding='utf-8-sig'),skipinitialspace=True)
 def table(name,keep):
  iterator=rows(name);header=next(iterator);return header,[row for row in iterator if keep(dict(zip(header,row)))]
 rh,rs=table('routes.txt',lambda r:int(r.get('route_type') or -1) in types);ri=rh.index('route_id');route_ids={r[ri] for r in rs}
 th,ts=table('trips.txt',lambda t:t['route_id'] in route_ids);ti=th.index('trip_id');trip_ids={t[ti] for t in ts}
 print('Filtering',key,len(route_ids),'rail routes',len(trip_ids),'trips',flush=True)
 with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as out:
  for name in ['stops.txt','calendar.txt','calendar_dates.txt','agency.txt','feed_info.txt','transfers.txt']:
   if name in names:out.writestr(name,z.read(names[name]))
  for name,head,data in [('routes.txt',rh,rs),('trips.txt',th,ts)]:
   with out.open(name,'w') as binary:
    stream=io.TextIOWrapper(binary,encoding='utf-8',newline='');writer=csv.writer(stream);writer.writerow(head);writer.writerows(data);stream.flush();stream.detach()
  iterator=rows('stop_times.txt');header=next(iterator);idx=header.index('trip_id');kept=0
  with out.open('stop_times.txt','w') as binary:
   stream=io.TextIOWrapper(binary,encoding='utf-8',newline='');writer=csv.writer(stream);writer.writerow(header)
   for row in iterator:
    if row[idx] in trip_ids:writer.writerow(row);kept+=1
   stream.flush();stream.detach()
 print('Prepared',key,kept,'rail stop times',flush=True)
selected=sys.argv[1:] or list(feeds)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(prepare,selected))
