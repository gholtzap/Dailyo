"""Append major cities from Natural Earth 10m v5.1.2 to the original city pool."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'dist/games/data/maprot.json'
data = json.loads(path.read_text())
data['places'] = data['places'][:214]
seen = {(row[0].casefold(), row[1].casefold()) for row in data['places']}
# Match countries already named in the original pool.
aliases = {'United States of America': 'United States', 'Czechia': 'Czech Republic',
           'Democratic Republic of the Congo': 'Democratic Republic of the Congo'}
features = json.loads(Path(sys.argv[1]).read_text())['features']
for feature in sorted(features, key=lambda f: (-f['properties']['POP_MAX'], f['properties']['NAME'])):
    props = feature['properties']
    if props['POP_MAX'] < 100000 or props['ADM0NAME'] == 'Antarctica':
        continue
    name, country = props.get('NAMEASCII') or props['NAME'], props['ADM0NAME']
    country = aliases.get(country, country)
    key = name.casefold(), country.casefold()
    lon, lat = feature['geometry']['coordinates']
    # Different transliterations of an existing city are not new content.
    if key in seen or any(abs(lon-row[2]) < .15 and abs(lat-row[3]) < .15 for row in data['places']):
        continue
    seen.add(key)
    data['places'].append([name, country, round(lon,4), round(lat,4)])
    if len(data['places']) == 1000:
        break
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
print(len(data['places']), 'cities')
