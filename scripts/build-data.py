"""Freeze weekday daytime MTA patterns and NYC shorelines for the puzzle network."""
import csv
import io
import json
import statistics
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
z = zipfile.ZipFile(sys.argv[1])


def rows(name):
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig'))


def seconds(value):
    h, m, s = map(int, value.split(':'))
    return h * 3600 + m * 60 + s


stops = {s['stop_id']: s for s in rows('stops.txt') if s['location_type'] == '1'}
parents = {s['stop_id']: s['parent_station'] or s['stop_id'] for s in rows('stops.txt')}
routes = {r['route_id']: {'id': r['route_id'], 'name': r['route_short_name'], 'color': r['route_color'] or '808183'} for r in rows('routes.txt') if r['route_id'] != 'SI'}
details = {s['GTFS Stop ID']: s for s in csv.DictReader(Path(sys.argv[3]).open())} if len(sys.argv) > 3 else {}
trips = {t['trip_id']: t for t in rows('trips.txt') if t['service_id'] == 'Weekday' and t['route_id'] in routes}
times = defaultdict(list)
for s in rows('stop_times.txt'):
    if s['trip_id'] in trips:
        times[s['trip_id']].append((int(s['stop_sequence']), parents[s['stop_id']], seconds(s['arrival_time']), seconds(s['departure_time'])))

# Group connected station platforms into named transfer complexes. Transfers have
# a fixed game cost, rather than pretending to simulate live platform walk times.
union = {s: s for s in stops}


def find(s):
    while union[s] != s:
        union[s] = union[union[s]]
        s = union[s]
    return s


for t in rows('transfers.txt'):
    a, b = parents.get(t['from_stop_id']), parents.get(t['to_stop_id'])
    if a in union and b in union and t['transfer_type'] != '3':
        union[find(a)] = find(b)

patterns = defaultdict(list)
for tid, entries in times.items():
    entries.sort()
    if not 10 * 3600 <= entries[0][3] < 16 * 3600:
        continue
    trip = trips[tid]
    key = (trip['route_id'], trip['direction_id'], tuple(x[1] for x in entries))
    patterns[key].append((tid, entries))
maximum = defaultdict(int)
for (route, direction, _), samples in patterns.items():
    maximum[route, direction] = max(maximum[route, direction], len(samples))
selected = [(key, samples) for key, samples in patterns.items() if len(samples) >= max(3, maximum[key[:2]] * .12)]
shape_ids = {trips[samples[0][0]]['shape_id'] for _, samples in selected}
shapes = defaultdict(list)
for p in rows('shapes.txt'):
    if p['shape_id'] in shape_ids:
        shapes[p['shape_id']].append((int(p['shape_pt_sequence']), round(float(p['shape_pt_lon']), 5), round(float(p['shape_pt_lat']), 5)))
for sid in shapes:
    shapes[sid] = [[x[1], x[2]] for x in sorted(shapes[sid])]

output_patterns = []
used = set()
for (route, direction, ids), samples in selected:
    tid, entries = samples[0]
    points = shapes[trips[tid]['shape_id']]
    indices = []
    previous = 0
    for sid in ids:
        station = stops[sid]
        lat, lon = float(station['stop_lat']), float(station['stop_lon'])
        idx = min(range(previous, len(points)), key=lambda i: (points[i][0]-lon)**2 * .57 + (points[i][1]-lat)**2)
        indices.append(idx)
        previous = idx
    durations = [round(statistics.median(max(15, es[i+1][2] - es[i][2]) for _, es in samples)) for i in range(len(ids)-1)]
    station_ids = [find(s) for s in ids]
    used.update(ids)
    output_patterns.append({'route': route, 'headsign': trips[tid]['trip_headsign'], 'stations': station_ids, 'seconds': durations, 'geometry': points, 'offsets': indices})

groups = defaultdict(list)
for sid in used:
    groups[find(sid)].append(sid)


boroughs = json.loads(Path(sys.argv[2]).read_text())


def inside(lon, lat, ring):
    result = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > lat) != (b[1] > lat) and lon < (b[0]-a[0]) * (lat-a[1]) / (b[1]-a[1]) + a[0]:
            result = not result
    return result


def area(lat, lon):
    for f in boroughs['features']:
        if any(inside(lon, lat, p[0]) for p in f['geometry']['coordinates']):
            return f['properties']['boroname']
    return 'New York'


stations = {}
for gid, members in sorted(groups.items()):
    members.sort()
    names = list(dict.fromkeys(stops[s]['stop_name'] for s in members))
    lat = sum(float(stops[s]['stop_lat']) for s in members) / len(members)
    lon = sum(float(stops[s]['stop_lon']) for s in members) / len(members)
    stations[gid] = {'id': gid, 'name': ' / '.join(names), 'lat': round(lat, 6), 'lon': round(lon, 6), 'area': area(lat, lon), 'members': members}

# Give repeated street-number stations a geographic clue without revealing trains.
duplicates = Counter((s['name'], s['area']) for s in stations.values())
for s in stations.values():
    s['label'] = s['name']
    if duplicates[s['name'], s['area']] > 1:
        lines = list(dict.fromkeys(details[m]['Line'] for m in s['members'] if m in details))
        s['label'] += ' · ' + (' / '.join(lines) if lines else s['id'])

feed = list(rows('feed_info.txt'))[0]
network = {'metadata': {'source': 'https://www.mta.info/developers', 'feedVersion': feed['feed_version'], 'service': 'Weekday, 10 am–4 pm', 'transferSeconds': 240, 'model': 'Median scheduled running time; 4 minutes between train legs. No initial wait or live delays.'}, 'stations': stations, 'routes': routes, 'patterns': output_patterns}
(ROOT/'dist/data/network.json').write_text(json.dumps(network, separators=(',', ':')))


def simplify(points, tolerance=.00008):
    if len(points) <= 2:
        return points
    ax, ay = points[0][:2]
    bx, by = points[-1][:2]
    dx, dy = bx-ax, by-ay
    def dist(p):
        t = max(0, min(1, ((p[0]-ax)*dx+(p[1]-ay)*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
        return (p[0]-ax-t*dx)**2 + (p[1]-ay-t*dy)**2
    index = max(range(1, len(points)-1), key=lambda i: dist(points[i]))
    if dist(points[index]) <= tolerance*tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index+1], tolerance)[:-1] + simplify(points[index:], tolerance)


for feature in boroughs['features']:
    feature['properties'] = {'name': feature['properties']['boroname']}
    feature['geometry']['coordinates'] = [[[ [round(v,5) for v in point[:2]] for point in simplify(ring)] for ring in polygon] for polygon in feature['geometry']['coordinates']]
(ROOT/'dist/data/boroughs.json').write_text(json.dumps(boroughs, separators=(',', ':')))
print(json.dumps({'stations': len(stations), 'patterns': len(output_patterns), 'routes': len({p['route'] for p in output_patterns}), 'feed': feed['feed_version']}))
