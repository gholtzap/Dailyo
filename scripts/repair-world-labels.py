"""Repair display labels without changing frozen routing or puzzle identity.

Kaohsiung names follow the operator's published Red/Orange line order, matched
against the frozen patterns and their named interchange. Other missing names
are matched by source coordinates and line membership. Sources accompany each
replacement. Routing IDs, geometry, timing and feed versions remain unchanged.
"""
import importlib.util
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('world_builder', ROOT / 'scripts/build-world-networks.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
overrides = json.loads((ROOT / 'scripts/world-station-names.json').read_text())
for folder in (ROOT / 'dist/world-data').iterdir():
    file = folder / 'network.json'
    if not file.exists():
        continue
    original = file.read_text()
    network = json.loads(original)
    for sid, entry in overrides.get(folder.name, {}).items():
        network['stations'][sid]['name'] = entry['name']
    # The builder owns public line and geographic context for homonymous stops.
    builder.label_stations(network)
    encoded = json.dumps(network, ensure_ascii=False, separators=(',', ':'))
    if json.loads(original) != network:
        file.write_text(encoded)
    challenges_file = folder / 'challenges.json'
    challenges = json.loads(challenges_file.read_text())
    changed = False
    for challenge in challenges:
        for end in ['from', 'to']:
            label = network['stations'][challenge[end]]['label']
            if challenge[end + 'Title'] != label:
                challenge[end + 'Title'] = label
                changed = True
    if changed:
        challenges_file.write_text(json.dumps(challenges, ensure_ascii=False, separators=(',', ':')))
    assert not any(re.search(r'Station \d+| · s\d+', s['label']) for s in network['stations'].values()), folder.name
