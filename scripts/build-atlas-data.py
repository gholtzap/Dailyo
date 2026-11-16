"""Build maprot and borderrot data from local Natural Earth and GeoNames extracts."""
import csv
import json
import sys
from pathlib import Path

output = Path(__file__).resolve().parents[1] / 'dist/games/data'
land, cities, countries = map(Path, sys.argv[1:])


def write(name, value):
    (output / f'{name}.json').write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


polygons = []
for feature in json.loads(land.read_text())['features']:
    geometry = feature['geometry']
    polygons.extend(geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']])
outline = ''.join(
    'M' + 'L'.join(f'{lon + 180:.2f},{90 - lat:.2f}' for lon, lat in ring) + 'Z'
    for polygon in polygons for ring in polygon
)
places = []
for feature in json.loads(cities.read_text())['features']:
    place = feature['properties']
    if place['pop_max'] < 100_000 or place['adm0_a3'] == 'ATA':
        continue
    lon, lat = feature['geometry']['coordinates']
    places.append([place['name'], place['adm0name'], round(lon, 4), round(lat, 4)])
places.sort(key=lambda place: (place[0], place[1]))
# Keep the existing row order so previously issued daily sets stay the same.
for place in places:
    if place[:2] == ['Nur-Sultan', 'Kazakhstan']:
        place[0] = 'Astana'
write('maprot', {'land': outline, 'places': places})

with countries.open() as file:
    rows = {row[0]: row for row in csv.reader((line for line in file if not line.startswith('#') and line.strip()), delimiter='\t')}

# Use reciprocal borders in the main territories of countries. GeoNames includes
# Guantánamo as US–Cuba and represents several overseas dependencies separately.
# Kosovo has its own node in this graph, so it separates Serbia from Albania.
omit_edges = {frozenset({'CU', 'US'}), frozenset({'AL', 'RS'})}
excluded = {'AN', 'CS', 'GF', 'GI', 'GL', 'GP', 'HK', 'MF', 'MO', 'SX'}
names = {'BO': 'Bolivia', 'CD': 'DR Congo', 'CG': 'Republic of the Congo',
         'CI': 'Côte d’Ivoire', 'CZ': 'Czechia', 'MK': 'North Macedonia',
         'MM': 'Myanmar', 'NL': 'Netherlands', 'PS': 'Palestine', 'SZ': 'Eswatini',
         'TR': 'Türkiye', 'TZ': 'Tanzania', 'US': 'United States', 'VA': 'Vatican City',
         'VN': 'Vietnam'}
graph = []
for code, row in sorted(rows.items()):
    if code in excluded:
        continue
    neighbours = sorted(
        other for other in row[17].split(',')
        if other in rows and other not in excluded
        and frozenset({code, other}) not in omit_edges and code in rows[other][17].split(',')
    )
    if neighbours:
        graph.append([code, names.get(code, row[4]), neighbours])
write('borderrot', graph)
