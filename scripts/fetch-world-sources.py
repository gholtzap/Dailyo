"""Download the published Citylines topology, preserving raw inputs for audit/rebuild."""
import concurrent.futures, json, pathlib, time, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/world'
CACHE.mkdir(parents=True, exist_ok=True)
def fetch(url, path):
    if path.exists():
        try: return json.loads(path.read_text())
        except (ValueError,UnicodeError): pass
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Dailyo-Trainrot-World/1.0'}),timeout=60) as response: data=json.load(response)
            path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
            return data
        except Exception:
            if attempt==3: raise
            time.sleep(attempt+1)
lookup=fetch('https://www.citylines.co/api/cities/list_with_contributors',CACHE/'citylines-cities.json')
known={x['url'].strip('/') for x in lookup['cities']}
cities=json.loads((ROOT/'scripts/world-cities.json').read_text())
slugs=sorted({c['sourceSlug'] for c in cities if c['sourceSlug'] in known and c['slug']!='nyc'})
print('Downloading',len(slugs),'Citylines networks; GTFS needed:',', '.join(c['slug'] for c in cities if c['sourceSlug'] not in known),flush=True)
def download(slug):
    for name,endpoint in [('base','view/base_data'),('stations','raw_source/stations'),('sections','raw_source/sections')]:
        fetch(f'https://www.citylines.co/api/{slug}/{endpoint}',CACHE/f'{slug}-{name}.json')
    print('Cached',slug,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    list(pool.map(download,slugs))
