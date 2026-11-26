"""Import photographed grocery products from the frozen official catalog.

uv run --with curl_cffi==0.17.0 --with pillow==13.0.0 python scripts/fetch-product-images.py
Use --refresh-catalog to take a fresh official price/size snapshot first.
Only decoded, exact-product photos enter the playable catalog. Issued snapshots
are retained, and failed downloads are recorded without publishing broken rows.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import html
import io
import json
from pathlib import Path
import re
import time

from curl_cffi import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'dist/games/data/pricerot.json'
SNAPSHOT = ROOT / 'scripts/product-catalog-snapshot.json'
REPORT = ROOT / 'scripts/product-catalog-report.json'
CACHE = ROOT / '.cache/products/images'
FIELDS = ('sku name item_title retail_price sales_size sales_uom_description '
          'primary_image price_range{minimum_price{final_price{currency value}}} '
          'categories{name url_path}')


def request(url, **kwargs):
    # Sequential attempt identities prevent a retry from overlapping a previous GET.
    # requesting -> complete on HTTP success/not-found; -> backoff on transient
    # failure with attempts left; -> failed after attempt 3. backoff -> requesting.
    state = ('requesting', 1)
    while True:
        match state:
            case ('requesting', attempt):
                try:
                    response = requests.get(url, impersonate='chrome', timeout=60, **kwargs)
                    if response.status_code not in (404, 410):
                        response.raise_for_status()
                    state = ('complete', response)
                except requests.RequestsError as error:
                    state = ('backoff', (attempt, error)) if attempt < 3 else ('failed', error)
            case ('backoff', (attempt, _error)):
                time.sleep(1 + (attempt - 1) * 2)
                state = ('requesting', attempt + 1)
            case ('complete', response):
                return response
            case ('failed', error):
                raise error
            case _:
                raise RuntimeError('Invalid download state')


def refresh():
    rows = []
    total = None
    page = 1
    while True:
        query = ('{products(filter:{published:{eq:true}},pageSize:500,currentPage:'
                 + str(page) + '){total_count page_info{total_pages} items{' + FIELDS + '}}}')
        response = request('https://traderjoes.com/api/graphql', params={'query': query})
        payload = response.json()
        if payload.get('errors'):
            raise RuntimeError(payload['errors'])
        data = payload['data']['products']
        if total is not None and total != data['total_count']:
            raise RuntimeError('Catalog changed during pagination; retry the snapshot')
        total = data['total_count']
        rows.extend(data['items'])
        print(f'Catalog page {page}: {len(rows)}/{total}', flush=True)
        if page >= data['page_info']['total_pages']:
            break
        page += 1
    if len(rows) != total or len({row['sku'] for row in rows}) != total:
        raise RuntimeError('Incomplete or duplicate catalog pages')
    now = datetime.now(timezone.utc)
    snapshot = dict(captured=now.date().isoformat(), fetchedAt=now.isoformat(),
                    endpoint='https://traderjoes.com/api/graphql', total=total, items=rows)
    SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')


def sku_for(row):
    return row.get('sku') or row['source'].rsplit('-', 1)[-1].rsplit('/', 1)[-1]


def new_row(product, captured):
    if not any(category['url_path'] in ('food', 'beverages') for category in product['categories']):
        return None, 'outside food and beverages'
    name = ' '.join(html.unescape(product.get('item_title') or '').split())
    sku = product['sku']
    if not re.fullmatch(r'\d{6}', sku) or not name:
        return None, 'missing product identity'
    try:
        price = Decimal(product.get('retail_price') or '0')
        quantity = Decimal(str(product.get('sales_size') or '0'))
        listed = product['price_range']['minimum_price']['final_price']
        cents = price * 100
        if (not price.is_finite() or price <= 0 or cents != cents.to_integral_value()
                or listed['currency'] != 'USD' or Decimal(str(listed['value'])) != price):
            return None, 'missing or inconsistent positive USD price'
        if not quantity.is_finite() or quantity <= 0 or not product.get('sales_uom_description'):
            return None, 'missing package size'
    except (InvalidOperation, TypeError, KeyError):
        return None, 'invalid price or package size'
    unit = {'Oz': 'oz', 'Weight Ounce': 'oz', 'Fl Oz': 'fl oz', 'Lb': 'lb',
            'Each': 'each', 'Doz': 'dozen', 'Bag': 'bag', 'Pint': 'pint', 'Qt': 'qt'}.get(
                product['sales_uom_description'], product['sales_uom_description'])
    if not (product.get('primary_image') or '').startswith('/content/dam/trjo/products/'):
        return None, 'missing official product photo'
    row = dict(id=f'tj-{sku}', sku=sku, name=name, size=f'{quantity:g} {unit}', cents=int(cents),
               source=f'https://www.traderjoes.com/home/products/pdp/{sku}',
               retailer='Trader Joe’s', currency='USD', captured=captured,
               credit='Price and product photography: Trader Joe’s',
               license='Product photography © Trader Joe’s; used for product identification')
    return row, None


def photo(row, product, fallbacks, refresh_images):
    source = 'https://www.traderjoes.com' + product['primary_image']
    key = hashlib.sha256(source.encode()).hexdigest()
    cached = CACHE / f'{key}.json'
    if not refresh_images and cached.exists():
        meta = json.loads(cached.read_text())
        if (ROOT / 'dist' / meta['image'].lstrip('/')).is_file():
            return {**row, **meta}, None
    response = request(source)
    fallback = fallbacks.get(product['sku']) if response.status_code in (404, 410) else None
    if fallback:
        source = fallback['image']
        response = request(source)
    if response.status_code in (404, 410):
        return None, 'official photo not found'
    response.raise_for_status()
    if not response.headers.get('content-type', '').startswith('image/'):
        return None, 'photo URL returned non-image data'
    try:
        image = Image.open(io.BytesIO(response.content))
        image.load()
    except (OSError, ValueError):
        return None, 'photo could not decode'
    if min(image.size) < 100:
        return None, 'photo too small'
    image.thumbnail((800, 800), Image.Resampling.LANCZOS)
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA')
    output = io.BytesIO()
    image.save(output, format='WEBP', quality=84, method=4)
    data = output.getvalue()
    digest = hashlib.sha256(data).hexdigest()[:12]
    path = f'/games/media/price-{row["id"]}-{digest}.webp'
    (ROOT / 'dist' / path.lstrip('/')).write_bytes(data)
    meta = dict(image=path, imageSource=source)
    if fallback:
        meta['credit'] = 'Price: Trader Joe’s; ' + fallback['credit']
        meta['imageSourcePage'] = fallback['source']
    cached.write_text(json.dumps(meta))
    return {**row, **meta}, None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-catalog', action='store_true')
    parser.add_argument('--refresh-images', action='store_true')
    parser.add_argument('--jobs', type=int, default=6, choices=range(1, 9))
    parser.add_argument('--minimum', type=int, default=2000)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    if args.refresh_catalog:
        refresh()
    snapshot = json.loads(SNAPSHOT.read_text())
    products = {product['sku']: product for product in snapshot['items']}
    if len(products) != snapshot['total']:
        raise RuntimeError('Snapshot count or SKU uniqueness mismatch')
    existing = json.loads(CATALOG.read_text())
    fallbacks = json.loads((ROOT / 'scripts/product-image-fallbacks.json').read_text())
    # Keep existing IDs, prices, order and files for saved games and daily rankings.
    retained = []
    for row in existing:
        path = ROOT / 'dist' / row['image'].lstrip('/')
        with Image.open(path) as image:
            image.verify()
        retained.append(row)
    seen_skus = {sku_for(row) for row in retained}
    seen_names = {(' '.join(row['name'].split()).casefold(), row['size']) for row in retained}
    excluded = []
    candidates = []
    for product in sorted(products.values(), key=lambda product: product['sku']):
        if product['sku'] in seen_skus:
            continue
        row, reason = new_row(product, snapshot['captured'])
        if not reason and (row['name'].casefold(), row['size']) in seen_names:
            reason = 'duplicate product name and package size'
        if reason:
            excluded.append(dict(sku=product['sku'], name=product['item_title'], reason=reason))
            continue
        seen_names.add((row['name'].casefold(), row['size']))
        candidates.append((row, product))
    print(f'{len(retained)} retained + {len(candidates)} candidates; downloading exact product photos', flush=True)
    results = {}
    def worker(candidate):
        row, product = candidate
        # Network failures abort publication, rather than silently discarding hundreds of products.
        value, reason = photo(row, product, fallbacks, args.refresh_images)
        return product, value, reason
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = [pool.submit(worker, candidate) for candidate in candidates]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            product, row, reason = future.result()
            if row:
                results[product['sku']] = row
            else:
                excluded.append(dict(sku=product['sku'], name=product['item_title'], reason=reason))
            if index % 50 == 0 or index == len(candidates):
                print(f'Photos {index}/{len(candidates)}: {len(results)} verified; {sum("photo" in item["reason"] for item in excluded)} excluded', flush=True)
    rows = []
    hashes = set()
    for row in retained + [results[sku] for sku in sorted(results)]:
        digest = hashlib.sha256((ROOT / 'dist' / row['image'].lstrip('/')).read_bytes()).hexdigest()
        if digest in hashes:
            excluded.append(dict(sku=sku_for(row), name=row['name'], reason='duplicate product photograph'))
            continue
        hashes.add(digest)
        rows.append(row)
    report = dict(captured=snapshot['captured'], totalSourceProducts=snapshot['total'],
                  retained=sum(sku_for(row) in seen_skus for row in rows),
                  added=sum(sku_for(row) not in seen_skus for row in rows), playable=len(rows),
                  retainedOutsideSnapshot=sorted(sku_for(row) for row in rows if sku_for(row) not in products),
                  imageBytes=sum((ROOT / 'dist' / row['image'].lstrip('/')).stat().st_size for row in rows),
                  excluded=sorted(excluded, key=lambda row: row['sku']))
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if len(rows) < args.minimum:
        raise RuntimeError(f'Only {len(rows)} verified products; catalog not published (minimum {args.minimum})')
    temporary = CATALOG.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(CATALOG)
    print(f'Published {len(rows)} photographed grocery products ({report["imageBytes"]:,} image bytes)', flush=True)


if __name__ == '__main__':
    main()
