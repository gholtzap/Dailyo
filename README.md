# dailyo

[Play dailyo](https://trainrot.vercel.app)

[Rush](https://trainrot.vercel.app/rush/) opens with the first puzzle and rotates through all twenty-one games. Play again starts a fresh random puzzle sequence. Refreshing restores the current run in this tab; timed rounds return paused. Only the opening puzzle of the run is untimed. Keep answering correctly to stay in a game. The clock gets shorter until it reaches the game’s minimum. A miss or timeout shows the answer briefly, then advances automatically. Press and hold an answer to stop automatic progression, or choose Keep answer until you are ready to continue. Review answer reopens the last result while preserving the current puzzle and its clock. Timed rounds pause when the tab is hidden; choose Resume when you return. Opening How to play also pauses the clock. Choose Resume after closing help. Paused puzzles are hidden. You can also pause a timed round yourself. Choose a game from the Rush menu to open its shareable URL, such as [flagrot Rush](https://trainrot.vercel.app/rush/flagrot/).

[Daily mix](https://trainrot.vercel.app/daily/) plays all twenty-one daily games in one session. It resumes from the first unfinished game, shares progress with the individual game pages, and shows a recap. Skipped games can be played from the recap.

[trainrot](https://trainrot.vercel.app/trainrot/) is a subway routing game. See two stations, choose the trains you would take, then compare your route with the fastest one.

The site also has [flagrot](https://trainrot.vercel.app/flags/), [langrot](https://trainrot.vercel.app/languages/), and [Vocabulary](https://trainrot.vercel.app/vocabulary/). Each has a shared five-question daily set and unlimited practice. Daily sets reset at midnight in New York; progress is stored in the browser. flagrot includes all 249 ISO country and territory codes, plus England, Scotland, Wales, and Kosovo. langrot uses 512 written excerpts across 64 languages. Vocabulary asks you to match English words to definitions and shows an example sentence after each answer.

- [maprot](https://trainrot.vercel.app/maprot/) asks you to pin five cities on a blank world map. Enlarge the map, zoom with the controls or pinch, drag to pan, and drag your pin for precision. Arrow keys move the pin; hold Shift for finer adjustment. Your score is the total distance from the answers.
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

You need Bun 1.4.5, Node 24, and Python 3.

```sh
bun install --frozen-lockfile
bun run dev
```

Open [localhost:4173](http://localhost:4173). The local build includes all twenty-one games and uses Harbour City, a fictional subway network. No API keys or downloads of transit feeds are needed to play.

## trainrot

Find the fastest subway route between the two endpoints in six guesses. Tap trains in order, then choose **Check route**. The router finds the transfers for the exact train sequence. An incomplete sequence earns partial credit and stays editable. **Show answer** reveals the fastest route. Revealing the subway map makes the journey unscored.

The Daily journey resets at midnight in New York. In Practice, choose Easy, Medium, or Hard and play as many journeys as you like. The current draft or result stays in this browser on reload.

## TypeScript source

All browser application source lives in `src/`. The scores API is `api/daily-score.ts`, with request protection in `lib/score-protection.ts`. `dist/` contains the static site and JavaScript emitted by TypeScript; edit the TypeScript sources rather than generated modules. Existing JavaScript test and data tooling runs against the compiled output.

`npm run dev` watches the TypeScript browser source and serves the compiled site on port 4173 (`PORT` can override it). Reload the browser after a change.

`npm run typecheck` checks the browser and API together with strict TypeScript settings. `npm run build` typechecks, emits minified browser modules with Bun, stages the transit data, and verifies the release. Module URLs and exports stay stable; linked source maps remain available locally. The Vercel function compiles the API TypeScript independently.

## Verified lifecycle rules

Train lifecycle decisions and Rush's phase, deadline, pause/resume, and stale-round
rules are implemented in `verification/*.bend`. The browser and scores API use
JavaScript compiled from those files; TypeScript handles routing assessments,
browser effects, input validation, storage, and database access.

Run `npm run verify` to check `LAWS.bend` and `PROOF.bend` with Bend's independent
`--verdict` kernel, reproduce the generated JavaScript, and confirm the proof gate
rejects deliberate regressions. The first run downloads checksum-pinned Bend
2.0.40 and Lean 4.34.0 into `.cache/`; later runs reuse them. Verification supports
Linux x64/arm64 and macOS arm64 and needs `tar` with Zstandard support.

After changing Bend code or proofs, run `npm run verify:generate` and commit the
updated `src/verified/*.mjs` files and `verification/generated.json`. Regular
builds check their hashes and stage those modules for the browser; CI reruns the
proof checker and compiler independently. Hosted builds use the checked-in
modules and do not download the proof toolchain.

The laws prove the stated lifecycle properties under Bend's semantics. They do
not prove routing/scoring calculations, the JS compiler, browser events, or the
database. Existing browser, HTTP, scoring, and database checks cover those
boundaries. See [the transition table and proof scope](verification/README.md). CI also runs score-protection and train-score replay checks against a disposable Postgres service.
For local API checks, compile with `npm test`, then run
`DATABASE_URL=postgres://... node scripts/test-score-api.mjs` with an empty,
disposable loopback database. The runner applies the schema, starts a fresh
score API for each scenario, and cleans up its test rows.

## Build and test

```sh
npm test
npm run build
npx playwright install chromium
```

With the local server running in another terminal, run `npm run test:e2e` for desktop and mobile browser checks. Use `npm run lint:ui` for trainrot and `npm run lint:ui:games` for the other three games. Use `npm run lint:ui:feed` for the Daily Feed. Reports go in `test-results/`. Daily Feed and Rush browser suites cover game loading, progression, restoration, and recaps.

`npm run data:demo` creates the fictional stations, line geometry, and puzzles in `dist/data/`. Local builds, local dev, and GitHub CI generate this dataset. The build independently checks all shortest routes before adding the license and notices to the static site output.

## Geography data tools

`python3 scripts/build-atlas-data.py land.geojson places.geojson countryInfo.txt` rebuilds the map and border data from local Natural Earth 110m land and populated-place GeoJSON files and the GeoNames country information extract. See the [data sources](THIRD_PARTY_NOTICES.md).

`python3 scripts/build-border-map.py ne_50m_admin_0_map_units.geojson` rebuilds Borderrot’s country outlines and label positions from Natural Earth 50m map units.

To optimize newly fetched photo decks, run `uv run --with pillow==13.0.0 python scripts/optimize-visual-assets.py`. Photos larger than 500 KB become WebP at quality 85, with width capped at 1000 pixels and their aspect ratios and crop positions preserved. The shipped files need no image tools at build time. Original files are backed up in `.cache/visual-originals/` locally.

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
It limits short bursts per network on each running function instance, rejects
untracked networks when that local limiter reaches capacity, and atomically caps
validly shaped submissions at 120 per network per minute across all instances in
Postgres. A database failure returns 503 rather than bypassing the shared limit.
It also uses Postgres to cap how many new
ranking identities a network can create per hour. The database stores keyed
network identifiers for these limits. Existing browsers can still submit after
the new-identity limit is reached. Local game saves work independently.

Ranking responses are cached in Postgres for 15 seconds per browser, game, day,
and puzzle. Concurrent refreshes lock the same score row, so repeated submissions
keep the original score without repeating inserts or ranking scans while cached.
Comparisons can lag new finishers by up to 15 seconds. Every submission still
passes input validation and the shared request limit.

| Current state            | Event and rule                             | Result                                                   |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| Request budget available | Atomic shared counter below 120            | Consume one slot; validate and grade the result          |
| Request budget exhausted | Another submission in the same minute      | Return 429 with Retry-After                              |
| No score                 | Valid finish                               | Insert the first score and cache its ranking             |
| Fresh ranking            | Repeat finish from the same signed browser | Return the cached first-score ranking                    |
| Expired ranking          | Valid repeat finish                        | Lock the score row, recompute once, cache for 15 seconds |
| Database unavailable     | Limit, score, or refresh fails             | Return 503; local saves remain available                 |

Apply `scripts/daily-scores.sql` before deploying API changes; it is an additive,
repeatable migration for existing databases. Set Production `CRON_SECRET` to a
random secret of at least 32 characters. Vercel calls `/api/score-maintenance`
daily at 10:00 UTC with its Bearer secret. The authenticated job keeps today and
the previous 89 New York calendar dates, deletes older scores and their cached
rankings, and removes expired request/admission counters. Repeating cleanup is
safe. Missing or incorrect authorization cannot trigger deletion.

The firewall configuration in `scripts/score-firewall-rule.json` is applied to
the linked Vercel project separately from deployment. Its rule
**Limit daily score submissions** matches only
`POST /api/daily-score`, counts by IP, and returns 429 above 240 requests per
60 seconds per region. The database's 120-request limit remains shared across
regions and groups IPv6 addresses by /64. The firewall catches malformed traffic
before function execution; it does not replace the shared application limit.

For real Postgres checks, build the browser and API, then run
`DATABASE_URL=postgres://... node scripts/test-score-api.mjs` against an empty
disposable loopback database. Two independent API processes exercise concurrent
rate limiting, cache reuse/expiry/isolation, first-score preservation, database
failure, and authenticated retention boundaries. A repeatable result receipt is
written to `test-results/score-hardening/receipt.json`.

To check the request limits and cookie migration, run
`node tests/score-protection.mjs` with `TRAINROT_TEST_URL` set to a loopback
server running the score API and `DATABASE_URL` set to its empty test database.
To exercise all seven games against an empty test database, set
`TRAINROT_TEST_URL` to the running site and run `node tests/rankings.mjs`.

## Visual and everyday games

- **skyrot** identifies cities from overhead NASA photography. Daily and Practice reveal wider views after misses; Rush gives one guess.
- **pricerot** estimates recorded US supermarket prices before tax, with the exact package size, retailer, currency, and snapshot date displayed. Images are locally bundled photographs of the exact products. Items without sourced product photographs are excluded from Daily, Practice, and Rush. Rush accepts estimates within 20%.
- **skylinerot** identifies cities from skyline photos.
- **zoomrot** identifies everyday objects from cropped photos, revealing more after misses.
- **orderrot** arranges four items from lowest to highest across facts, measurements, and chronology. Results show your submitted order beside the correct order. Rush uses three.

Each has five daily questions, unlimited Practice sets, local progress, shareable results, daily rankings when configured, and a dedicated `/rush/<game>/` route. All five join the full Daily Feed and Rush rotation. Photo and answer sources appear after each round.

## trainrot world

`/trainrot-world/` defaults to `/trainrot-world/nyc/`. The new edition includes 98 city networks, each with its own URL, daily puzzle, practice difficulty, saved progress and ranking puzzle identity. `/trainrot/` retains the original game. Search **Change city** by city or country; larger networks also have a line search.

The 97 additional frozen networks and their puzzle decks are bundled in `dist/world-data/`; NYC uses the existing production data bundle. Each additional city has 366 validated, solvable puzzles. Daily puzzles reset at midnight in New York. Each network is a documented snapshot, rather than a guarantee of complete or live transit coverage.

GTFS imports use daytime service patterns and scheduled running times. Published topology snapshots use an explicit distance-based timing model. The source and timing model are available in How to play, `/trainrot-world/sources/`, and the network JSON. Maps are schematic. No transit source is contacted while someone plays.

Run `npm run build`, `npm run test:world`, `node tests/world-ranking.mjs`, `npm run test:e2e:world`, and `npm run lint:ui:world` to validate the expansion. The browser test defaults to `http://127.0.0.1:4175`; serve `dist/` on that port or set `TRAINROT_TEST_URL`. Browser QA intercepts ranking submissions; server replay tests do not write to the database.

To rebuild source data, run `node scripts/rebuild-world.mjs` with Python 3, Node and network access. `scripts/world-source-plan.json` records each selected source; `scripts/world-snapshot-version.json` pins the published snapshot revision. Raw downloads stay in ignored `.cache/world/`. Rebuilding from current agency feeds can change data versions. Normal builds validate the frozen bundles and do not download worldwide feeds. The hosted NYC input follows the existing private-Blob production build process.

## Practice difficulty and puzzle review

skyrot, skylinerot, zoomrot, and yearrot offer Easy, Standard, and Hard in Practice.
Each level keeps its own progress, including after a reload. Daily and Rush use the
shared Standard puzzle; practice difficulty does not change daily rankings.
Hard photo rounds use tighter crops and curated lookalikes. Hard timelines use
nearby dated events without exposing a later question's answer.

Photo hints show the scoring change before you use them (100 → 65 → 35 points).
Word ladders let you undo the last word while playing and inspect a shortest
solution after finishing. Subway results show your submitted itinerary first;
when another route ties it, the result explains the tie and offers the alternative.
Country search accepts words within a name, country codes, and familiar aliases
such as DRC, Ivory Coast, and UK.

Word-ladder, clue, and estimation Practice work through the available puzzles
before starting another cycle. The current puzzle and cycle progress resume
on reload. Map, timeline, and country-route results include a review of each
completed question; opening a review does not change the saved score.

Perception games: **countrot** (dot counting), **trackrot** (ball tracking),
**anglerot** (angle estimation), **temporot** (rhythm), and **splitrot** (line
proportions). Each has five seeded daily rounds, saved progress, unlimited
practice, and a harder practice variation. They also appear in Daily mix and
Rush. Tempo requires sound; tap with the button or Space after four reference beats. In Rush, angle and line-split puzzles open ready to answer. After the first dot-counting, ball-tracking, or rhythm round, later rounds start after a short ready cue. Preloaded rounds stay idle, and pausing freezes the cue and playback. Browsers that block automatic audio offer Enable sound.
Anglerot and Splitrot practice open directly on the controls. Memory, motion, and
audio rounds keep an explicit Start round action. Games use Next to continue,
See results to finish a set, and New puzzle or New set to start fresh practice.

Run `npm run test:e2e:perception` against the local server to check all five games,
saved Daily results, hard Practice, sharing, Daily mix, Rush at
390px and 1440px in the dark theme. Reports and screenshots go to
`test-results/perception/`. Run `npm run lint:ui:perception` for the UI policy checks. These are original implementations of the five
perception tasks described at https://perceptle.io/how-to-play/; no Perceptle
code, artwork, or audio is used.

### CI performance

`bun test` runs source tests without compiling them first. `bun check` owns type
checking; TypeScript is still used to emit browser and API JavaScript. `bun fmt --check`
checks changed source/configuration files, leaving existing unformatted files and
generated output alone. Bun 1.4.5 does not expose the documented native linter, so
`bun lint` currently runs the pinned Oxlint dependency.

CI builds the browser and backend once. Browser shards start immediately using
committed JavaScript; the build gate requires that output to match fresh compiler
output exactly. Database tests use the one backend build. Shards use timings recorded from real
runs. Successful shard receipts remain in GitHub logs; failures also upload them
as artifacts. Expanded photo pools split by game and viewport; the other large suites
split by viewport. Every original browser case and all 98 cities remain covered.
Two independent browser processes run per shard. Unchanged proofs reuse a
successful job from the exact base commit only when every proof input and verifier
file is identical. Missing evidence or changed inputs run the full prover.
The final `verify` check requires source, browser, database, and proof checks and
fails when total CI wall time exceeds 60 seconds, including runner waiting.
Two measured warm-cache runs completed in [59 seconds](https://github.com/gholtzap/Dailyo/actions/runs/44968559653)
and [56 seconds](https://github.com/gholtzap/Dailyo/actions/runs/44968823813), compared
with 5:38–8:59 for the five preceding Rush PRs. These measurements do not establish cold-cache or p95 latency below one minute. Measurement details are in `scripts/ci-benchmarks.json`.

This uses 18 standard browser runners, with two worker queues per runner. It uses
more aggregate compute to reduce waiting. Standard runners are
[free for this public repository](https://docs.github.com/en/actions/reference/runners/github-hosted-runners);
no paid capacity was added.

`bun run ci:feedback origin/main` selects source tests through transitive imports;
unknown configuration/resource changes use the full set. Browser runtime URLs
fall back to full journeys. Authoritative CI still runs the full suite before
merge: this personal repository cannot enable GitHub's native merge queue.
`merge_group` is supported if the repository moves to an eligible account.

Run `bun run hooks:install` to install the pre-push hook. It checks formatting,
lint and types for the actual pushed range without rewriting files; the local
budget is nine seconds. The optional production-NYC router suite still requires
production data and is run explicitly with `bun run test:nyc`.

To refresh the existing grocery photos without changing price snapshots, run `uv run --with curl_cffi --with pillow python scripts/fetch-product-images.py`. It matches exact retailer SKUs, verifies downloaded images, and bundles optimized, content-addressed WebP files. `scripts/product-image-fallbacks.json` records the credited alternate source for the catalog’s broken Belgian-chocolate photo.

With the site running, `node tests/product-images.mjs` verifies every shipped grocery image against its bundled bytes, exercises Daily, Practice, Rush and broken-image recovery, and checks mobile and desktop UI policy. Set `TRAINROT_TEST_URL` to run the same checks against a deployment. Reports go to `test-results/product-images/`.
