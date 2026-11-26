"""Bundle exact-SKU Trader Joe's photos. Run: uv run --with curl_cffi --with pillow python scripts/fetch-product-images.py

Existing price snapshots and item order stay unchanged. Missing images are removed
from the playable catalog; downloads must decode before the catalog is written.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path

from curl_cffi import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'dist/games/data/pricerot.json'
rows = json.loads(CATALOG.read_text())
skus = [row['source'].rsplit('-', 1)[-1].rsplit('/', 1)[-1] for row in rows]
query = '{products(filter:{sku:{in:' + json.dumps(skus) + '}},pageSize:100){items{sku name primary_image}}}'
response = requests.get('https://traderjoes.com/api/graphql', params={'query': query}, impersonate='chrome', timeout=30)
response.raise_for_status()
payload = response.json()
if payload.get('errors'):
    raise RuntimeError(payload['errors'])
products = {row['sku']: row for row in payload['data']['products']['items']}
fallbacks = json.loads((ROOT / 'scripts/product-image-fallbacks.json').read_text())


def download(entry):
    row, sku = entry
    product = products.get(sku)
    if not product or not product.get('primary_image'):
        print(f"Excluded {row['id']}: no official product image")
        return None
    source = 'https://www.traderjoes.com' + product['primary_image']
    response = requests.get(source, impersonate='chrome', timeout=60)
    fallback = fallbacks.get(sku) if response.status_code == 404 else None
    if fallback:
        source = fallback['image']
        response = requests.get(source, impersonate='chrome', timeout=60)
    if response.status_code == 404:
        print(f"Excluded {row['id']}: product photo not found")
        return None
    response.raise_for_status()
    image = Image.open(io.BytesIO(response.content))
    image.load()
    if min(image.size) < 100:
        raise ValueError(f"Image too small: {sku}")
    image.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format='WEBP', quality=88, method=6)
    data = output.getvalue()
    digest = hashlib.sha256(data).hexdigest()[:12]
    path = f'/games/media/price-{row["id"]}-{digest}.webp'
    (ROOT / 'dist' / path.lstrip('/')).write_bytes(data)
    row.update(image=path, imageSource=source,
               credit='Price and product photography: Trader Joe’s',
               license='Product photography © Trader Joe’s; used for product identification')
    if fallback:
        row['credit'] = 'Price: Trader Joe’s; ' + fallback['credit']
        row['imageSourcePage'] = fallback['source']
    print(f"{row['id']}: {image.width}×{image.height}, {len(data):,} bytes")
    return row


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(download, zip(rows, skus)))
results = [row for row in results if row]
if len(results) < 5:
    raise RuntimeError('Not enough photographed products; catalog not changed')
CATALOG.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(f'Bundled {len(results)}/{len(rows)} exact product photographs')
