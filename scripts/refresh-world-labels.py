import importlib.util,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('world',root/'scripts/build-world-networks.py');world=importlib.util.module_from_spec(spec);spec.loader.exec_module(world)
for city in world.CITIES:
 if city['slug']=='nyc':continue
 path=world.OUT/city['slug']/'network.json';network=json.loads(path.read_text());basemap=(path.parent/'boroughs.json').read_bytes()
 world.save(city,network)
 (path.parent/'boroughs.json').write_bytes(basemap)
