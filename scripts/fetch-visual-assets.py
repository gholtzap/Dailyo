"""Rebuild the licensed photo decks; no API keys or live requests during play."""
import urllib.request, urllib.parse, urllib.error, json, re, html, time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
HEADERS={'User-Agent':'Dailyo/1.0 (open photo game, source attribution retained)'}
DECKS={
'skyrot': [('new-york','New York City','ISS-40 New York City.jpg'),('paris','Paris','Paris iss.jpg'),('dubai','Dubai','ISS-66 Dubai, United Arab Emirates.jpg'),('venice','Venice','Venice, Italy, is pictured from the International Space Station (iss074e0437657).jpg'),('london','London','PIA04301.jpg'),('cairo','Cairo','Cairo, Egypt.jpg'),('san-francisco','San Francisco','ISS-43 San Francisco Bay.jpg'),('istanbul','Istanbul','Istanbul Bosporus ISS-1.jpg'),('rio','Rio de Janeiro','ISS-47 Rio de Janeiro and Niteroi, Brazil.jpg'),('chicago','Chicago','ISS-47 Chicago night view.jpg'),('singapore','Singapore','ISS035-E-11342 - View of Singapore.jpg'),('tokyo','Tokyo','ISS-62 Tokyo, Japan at night.jpg')],
'skylinerot': [('new-york','New York City','NYC Manhattan Skyline 1.JPG'),('paris','Paris','Iconic Paris Skyline.jpg'),('london','London','London skyline from Horniman Gardens.jpg'),('dubai','Dubai','Dubai skyline unsplash.jpg'),('sydney','Sydney','Sydney Skyline from UNSW.jpg'),('hong-kong','Hong Kong','Hong Kong Skyline1.jpg'),('singapore','Singapore','Skyline of Singapore from Marina Bay Sands.jpg'),('tokyo','Tokyo','2015-01-17 Skyline in Tokyo.jpg'),('chicago','Chicago','Chicago Skyline - Dusk.JPG'),('toronto','Toronto','Toronto skyline. (48993906211).jpg'),('san-francisco','San Francisco','Skyline of San Francisco from Embarcadero (July 2022).jpg'),('kuala-lumpur','Kuala Lumpur','Kuala Lumpur skyline long exposure.jpg')],
'zoomrot': [('tennis','Tennis ball','Tennis ball closeup.jpg'),('stapler','Stapler','Swingline-stapler.jpg'),('scissors','Scissors','Fiskars-scissors.jpg'),('staples','Staples','Office-staples.jpg'),('banana','Banana','Banana-Single.jpg'),('key','Key','Standard-lock-key.jpg'),('tape','Tape measure','Measuring-tape.jpg'),('pencil','Pencil','Number-2-pencil.jpg'),('filter','Coffee filter','Coffee-filter.jpg'),('hammer','Hammer','Claw-hammer.jpg'),('motherboard','Motherboard','Apple-MacBook-2007-Motherboard.jpg')]
}
def get(url):
 for delay in [0,5,10,20]:
  if delay:time.sleep(delay)
  try:
   return urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=35).read()
  except urllib.error.HTTPError as e:
   if e.code!=429 or delay==20:raise
 raise RuntimeError('Download failed')
def clean(value):return html.unescape(re.sub('<[^>]+>','',value)).strip()
all_files=[row[2] for deck in DECKS.values() for row in deck]
query=urllib.parse.urlencode(dict(action='query',format='json',titles='|'.join('File:'+x for x in all_files),prop='imageinfo',iiprop='url|extmetadata',iiurlwidth=1000))
response=json.loads(get('https://commons.wikimedia.org/w/api.php?'+query))
infos={page['title'].removeprefix('File:'):page['imageinfo'][0] for page in response['query']['pages'].values() if 'imageinfo' in page}
media=ROOT/'dist/games/media';media.mkdir(parents=True,exist_ok=True)
failures=[]
for game,deck in DECKS.items():
 path=ROOT/f'dist/games/data/{game}.json'
 previous={row['id']:row for row in json.loads(path.read_text())} if path.exists() else {}
 rows=[]
 for id,name,file in deck:
  if id in previous and (ROOT/'dist'/previous[id]['image'].lstrip('/')).exists():rows.append(previous[id]);continue
  try:
   info=infos[file];meta=info['extmetadata'];license=clean(meta.get('LicenseShortName',{}).get('value',''))
   if not any(x in license.lower() for x in ['public domain','cc0','cc by','cc-by']):raise ValueError('Unapproved license '+license)
   content=get(info.get('thumburl',info['url']))
   ext='jpg' if content.startswith(bytes([255,216])) else 'png' if content.startswith(bytes([137,80,78,71])) else 'webp' if content[8:12]==b'WEBP' else None
   if not ext:raise ValueError('Not a raster photo')
   filename=f'{game}-{id}.{ext}';(media/filename).write_bytes(content)
   rows.append(dict(id=id,name=name,image='/games/media/'+filename,source=info['descriptionurl'],credit=clean(meta.get('Artist',{}).get('value','See source')),license=license,licenseUrl=meta.get('LicenseUrl',{}).get('value',''),description=clean(meta.get('ImageDescription',{}).get('value',''))))
   print(f'{game}/{id}: {len(content)} bytes, {license}',flush=True)
   time.sleep(.7)
  except Exception as error:
   failures.append((game,id,str(error)));print(f'FAILED {game}/{id}: {error}',flush=True)
 for row in rows:
  if game=='skyrot' and row['id']=='rio':row['focus']=[35,30]
  if game=='skyrot' and row['id']=='london':row['credit']='NASA/GSFC/METI/ERSDAC/JAROS and U.S./Japan ASTER Science Team'
 path.write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n')
 print(f'{game}: {len(rows)} photos',flush=True)
if failures:raise SystemExit(str(failures))
