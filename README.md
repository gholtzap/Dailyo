# dailyo

[Play dailyo](https://trainrot.vercel.app)

[Daily Feed](https://trainrot.vercel.app/daily/) plays all eleven daily games in one session. It resumes from the first unfinished game, shares progress with the individual game pages, and shows a recap. Skipped games can be played from the recap.

**trainrot** is a subway routing game. See two stations, choose the trains you would take, then compare your route with the fastest one.

The site also has [flagrot](https://trainrot.vercel.app/flags/), [langrot](https://trainrot.vercel.app/languages/), and [Vocabulary](https://trainrot.vercel.app/vocabulary/). Each has a shared five-question daily set and unlimited practice. Daily sets reset at midnight in New York; progress is stored in the browser. flagrot includes all 249 ISO country and territory codes, plus England, Scotland, Wales, and Kosovo. langrot uses 512 written excerpts across 64 languages. Vocabulary asks you to match English words to definitions and shows an example sentence after each answer.

- [maprot](https://trainrot.vercel.app/maprot/) asks you to pin five cities on a blank world map. Your score is the total distance from the answers.
- [yearrot](https://trainrot.vercel.app/yearrot/) asks you to place five events on a timeline that grows with each turn.
- [borderrot](https://trainrot.vercel.app/borderrot/) asks you to connect countries by crossing as few land borders as possible.

- [ladderrot](https://trainrot.vercel.app/ladderrot/) challenges you to connect two words one letter at a time.
- [cluerot](https://trainrot.vercel.app/cluerot/) gives you up to five clues to identify the answer.
- [scalerot](https://trainrot.vercel.app/scalerot/) scores your estimate by its percentage error.
- [swaprot](https://trainrot.vercel.app/swaprot/) asks you to sort seven tiles using only adjacent swaps.

These games have daily puzzles and practice. The daily results can be copied without revealing the answers.

Flag artwork is from [flag-icons](https://github.com/lipis/flag-icons) (MIT; the license is in `dist/games/flags/LICENSE`). Language excerpts come from the [Universal Declaration of Human Rights translations](https://www.ohchr.org/en/human-rights/universal-declaration/translations), distributed in the NLTK `udhr2` corpus. To rebuild them, download `https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/udhr2.zip` and run `python3 scripts/build-languages.py <path-to-zip>`. The game data is bundled and does not require a network request to either source.

## License

dailyo's original code is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). You can use, modify, and share it for noncommercial purposes under the license terms. For commercial use outside the license's permissions, contact the repository owner.

The dailyo and game names, logo artwork, and bundled third-party materials are outside the code license. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Run locally

You need Node 24 and Python 3.

```sh
npm ci
npm run dev
```

Open [localhost:4173](http://localhost:4173). The local build includes all eleven games and uses Harbour City, a fictional subway network. No API keys or downloads of transit feeds are needed to play.

## trainrot

Find the fastest subway route between the two endpoints in six guesses. Tap trains in order, then choose **Check route**. The router finds the transfers for the exact train sequence. An incomplete sequence earns partial credit and stays editable. **Show answer** reveals the fastest route. Revealing the subway map makes the journey unscored.

The Daily journey resets at midnight in New York. In Practice, choose Easy, Medium, or Hard and play as many journeys as you like. The current draft or result stays in this browser on reload.

## Build and test

```sh
npm test
npm run build
npx playwright install chromium
```

With the local server running in another terminal, run `npm run test:e2e` for desktop and mobile browser checks. Use `npm run lint:ui` for trainrot and `npm run lint:ui:games` for the other three games. Use `npm run lint:ui:feed` for the Daily Feed. Reports go in `test-results/`.

`npm run data:demo` creates the fictional stations, line geometry, and puzzles in `dist/data/`. Local builds, local dev, and GitHub CI generate this dataset. The build independently checks all shortest routes before adding the license and notices to the static site output.

## Geography data tools

`python3 scripts/build-atlas-data.py land.geojson places.geojson countryInfo.txt` rebuilds the map and border data from local Natural Earth 110m land and populated-place GeoJSON files and the GeoNames country information extract. See the [data sources](THIRD_PARTY_NOTICES.md).

## Transit data tools

`scripts/build-data.py` converts a local GTFS archive, borough GeoJSON, and optional station CSV to trainrot's JSON format. `scripts/build-challenges.mjs` builds the NYC puzzle deck from that network and a locally supplied `scripts/original-challenges.json` seed file. For these scripts, supply your own source files and check their terms. See [third-party notices](THIRD_PARTY_NOTICES.md).

A compatible NYC data bundle can be checked locally with `node scripts/validate-release.mjs`, `npm run test:nyc`, and `npm run test:e2e:nyc`. Serve the prepared `dist/` directory directly for those browser tests. The normal dev and build commands generate the demo data instead.

## Production deployment

The live site uses NYC data. Its Vercel production build downloads a versioned bundle from private Blob storage and verifies its SHA-256 checksum before writing the site files. Configure `TRAINROT_DATA_URL`, `TRAINROT_DATA_SHA256`, and the store credential `BLOB_READ_WRITE_TOKEN` for Production only. A missing or invalid production bundle fails the build. The fictional network is available through local repo builds.

The published game sends the NYC data to the browser for routing and map display. The private store controls access to the build input.

### Daily rankings

Daily results are saved in the browser. The hosted scores API also records the first
ranked finish per browser, game, and daily puzzle. The result screen compares
scores with other finishers. Assisted and skipped Trainrot rounds and Practice
rounds stay outside the rankings.

Set a server-side `DATABASE_URL` to a pooled Postgres connection and apply
`scripts/daily-scores.sql` to enable the API. Set `DAILY_SCORE_SECRET` to a
stable, randomly generated secret of at least 32 characters. Rotating it
invalidates signed browser identities. Use a separate database for testing.

The score API limits request size and rejects cross-origin browser submissions.
It limits short bursts per network on each running function instance and uses
Postgres to cap how many new
ranking identities a network can create per hour. The database stores a keyed,
hourly network identifier for this limit. Existing browsers can still submit
after the new-identity limit is reached. Local game saves work independently.

To check the request limits and cookie migration, run
`node tests/score-protection.mjs` with `TRAINROT_TEST_URL` set to a loopback
server running the score API and `DATABASE_URL` set to its empty test database.
To exercise all seven games against an empty test database, set
`TRAINROT_TEST_URL` to the running site and run `node tests/rankings.mjs`.
