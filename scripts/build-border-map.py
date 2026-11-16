"""Build Borderrot map geometry from Natural Earth 50m admin-0 map units."""
import json
import math
import sys
from pathlib import Path

output = Path(__file__).resolve().parents[1] / 'dist/games/data'
graph = json.loads((output / 'borderrot.json').read_text())
countries = {code for code, _, _ in graph}


def point(lon, lat):
    lat = max(-85, min(85, lat))
    return round(lon, 2), round(-math.degrees(math.asinh(math.tan(math.radians(lat)))), 2)


paths = []
anchors = {}
for feature in json.loads(Path(sys.argv[1]).read_text())['features']:
    props = feature['properties']
    code = props['ISO_A2_EH']
    if props['GU_A3'] == 'SOL':
        code = 'SO'
    if props['GU_A3'] in {'NJM', 'PMD', 'PAZ'} or code not in countries:
        code = ''
    geometry = feature['geometry']
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    path = ''.join(
        'M' + 'L'.join(f'{x:g},{y:g}' for x, y in dict.fromkeys(point(lon, lat) for lon, lat in ring)) + 'Z'
        for polygon in polygons for ring in polygon
    )
    paths.append([code, path])
    if code:
        # Use the largest map unit's label point for countries with multiple units.
        if code not in anchors or len(path) > anchors[code][0]:
            anchors[code] = (len(path), point(props['LABEL_X'], props['LABEL_Y']))

assert countries == anchors.keys()
(output / 'border-map.json').write_text(json.dumps({
    'paths': paths, 'anchors': {code: position for code, (_, position) in anchors.items()},
}, separators=(',', ':')) + '\n')
