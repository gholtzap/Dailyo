"""Rebuild the curated, licensed photo decks; gameplay makes no external requests."""
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADERS = {'User-Agent': 'DailyoContentBot/1.0 (https://github.com/gholtzap/Dailyo; puzzle asset attribution)'}
DECKS = json.loads((ROOT / 'scripts/visual-photo-sources.json').read_text())
CROP_FIELDS = ('focus', 'detailFocus', 'distractors', 'lookalikes')


def get(url):
    for delay in [0, 5, 10, 20]:
        if delay:
            time.sleep(delay)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=35).read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or delay == 20:
                raise
    raise RuntimeError('Download failed')


def clean(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip()


previous = {game: {row['id']: row for row in json.loads((ROOT / f'dist/games/data/{game}.json').read_text())}
            for game in DECKS}
pending = [row for game, deck in DECKS.items() for row in deck
           if row['id'] not in previous[game] or not (ROOT / 'dist' / previous[game][row['id']]['image'].lstrip('/')).exists()]
infos = {}
# Commons accepts at most 50 titles; smaller batches also keep request URLs short.
for start in range(0, len(pending), 20):
    query = urllib.parse.urlencode(dict(action='query', format='json',
        titles='|'.join('File:' + row['file'] for row in pending[start:start + 20]),
        prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=1000))
    response = json.loads(get('https://commons.wikimedia.org/w/api.php?' + query))
    infos.update({page['title'].removeprefix('File:'): page['imageinfo'][0]
                  for page in response['query']['pages'].values() if 'imageinfo' in page})

media = ROOT / 'dist/games/media'
media.mkdir(parents=True, exist_ok=True)
rebuilt = {}
for game, deck in DECKS.items():
    rows = []
    for source in deck:
        identity = source['id']
        old = previous[game].get(identity)
        if old and (ROOT / 'dist' / old['image'].lstrip('/')).exists():
            row = dict(old)
        else:
            info = infos[source['file']]
            meta = info['extmetadata']
            license_name = clean(meta.get('LicenseShortName', {}).get('value', ''))
            if not any(term in license_name.lower() for term in ['public domain', 'cc0', 'cc by', 'cc-by']):
                raise ValueError('Unapproved license ' + license_name)
            content = get(info.get('thumburl', info['url']).split('?')[0])
            ext = 'jpg' if content.startswith(b'\xff\xd8') else 'png' if content.startswith(b'\x89PNG') else 'webp' if content[8:12] == b'WEBP' else None
            if not ext:
                raise ValueError('Not a raster photo: ' + source['file'])
            filename = f'{game}-{identity}.{ext}'
            (media / filename).write_bytes(content)
            row = dict(id=identity, name=source['name'], image='/games/media/' + filename,
                source=info['descriptionurl'], credit=clean(meta.get('Artist', {}).get('value', 'See source')),
                license=license_name, licenseUrl=meta.get('LicenseUrl', {}).get('value', ''))
            time.sleep(.7)
        row['name'] = source['name']
        for field in CROP_FIELDS:
            if field in source:
                row[field] = source[field]
        if game == 'skyrot' and identity == 'london':
            row['credit'] = 'NASA/GSFC/METI/ERSDAC/JAROS and U.S./Japan ASTER Science Team'
        rows.append(row)
    rebuilt[game] = rows

# A missing source or failed download must not replace a complete deck with a partial one.
for game, rows in rebuilt.items():
    (ROOT / f'dist/games/data/{game}.json').write_text(json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
    print(f'{game}: {len(rows)} photos')
