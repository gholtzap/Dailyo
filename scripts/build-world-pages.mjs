import fs from "node:fs";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  read = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const cities = read("scripts/world-cities.json");
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const template = fs
  .readFileSync(new URL("dist/trainrot/index.html", root), "utf8")
  .replace(/\s*<link rel="stylesheet" href="\/world.css">/g, "");
const registry = [];
for (const city of cities) {
  const network = read(
    city.slug === "nyc"
      ? "dist/data/network.json"
      : `dist/world-data/${city.slug}/network.json`,
  );
  const challenges = read(
    city.slug === "nyc"
      ? "dist/data/challenges.json"
      : `dist/world-data/${city.slug}/challenges.json`,
  );
  assert.ok(challenges.length >= 6, `${city.slug}: no puzzle deck`);
  const item = {
    ...city,
    stations: Object.keys(network.stations).length,
    lines: Object.keys(network.routes).length,
    timeModel: network.metadata.timeModel ?? "scheduled",
    feedVersion:
      city.slug === "nyc"
        ? "world-nyc:" + network.metadata.feedVersion
        : network.metadata.feedVersion,
    source: network.metadata.source,
    license: network.metadata.license ?? "MTA developer terms",
    attribution: network.metadata.attribution ?? [],
  };
  registry.push(item);
  let html = template
    .replace("<body>", `<body data-world-city="${city.slug}">`)
    .replace(
      /<title>.*?<\/title>/,
      `<title>${escape(city.name)} · Subway | dailyo</title>`,
    )
    .replace(
      "Plan subway routes from memory. Six guesses per journey.",
      `Find rail routes in ${escape(city.name)}. Play the daily journey or practice, then explore 98 cities.`,
    )
    .replace(
      '<link rel="stylesheet" href="/styles.css">',
      '<link rel="stylesheet" href="/styles.css">\n  <link rel="stylesheet" href="/world.css">',
    )
    .replace(
      "</head>",
      `  <link rel="canonical" href="https://trainrot.vercel.app/trainrot-world/${city.slug}/">\n</head>`,
    )
    .replace(
      'href="/trainrot/" aria-current="page"',
      `href="/trainrot-world/${city.slug}/" aria-current="page"`,
    )
    .replace(
      '<span class="current-game-name">trainrot</span>',
      '<span class="current-game-name">trainrot world</span>',
    );
  html = html
    .replace("Loading subway data…", "Loading rail network…")
    .replaceAll('aria-label="Subway map', 'aria-label="Rail map')
    .replace("Subway puzzle map", "Rail puzzle map");
  html = html.replace(/<a class="world-discover[^"]*"[\s\S]*?<\/a>/g, "");
  const dir = new URL(`dist/trainrot-world/${city.slug}/`, root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(new URL("index.html", dir), html);
  if (city.slug === "nyc") {
    const index = new URL("dist/trainrot-world/", root);
    fs.mkdirSync(index, { recursive: true });
    fs.writeFileSync(new URL("index.html", index), html);
  }
}
fs.mkdirSync(new URL("dist/world-data/", root), { recursive: true });
fs.writeFileSync(
  new URL("dist/world-data/cities.json", root),
  JSON.stringify(registry),
);
const sources = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Network data | dailyo</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/world.css"><body><main class="world-sources"><a href="/trainrot-world/nyc/">Subway cities</a><h1>Network data and puzzle times</h1><p>Trainrot World includes 98 frozen city networks. Coverage follows the source snapshot and can omit operators, stations or service variants. Maps are schematic; this is a routing puzzle, not a journey planner.</p><p>Scheduled networks use representative daytime GTFS service patterns and median scheduled running times. Estimated networks use published station connections and mapped distances, with a fixed speed by rail mode and 25 seconds per stop. Every model adds four minutes per transfer and excludes initial waits and live delays. The result is the fastest route under that city’s puzzle model.</p><p>Citylines-derived databases and OpenStreetMap-derived geography are available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License 1.0</a>. Individual contents are covered by the <a href="https://opendatacommons.org/licenses/dbcl/1-0/">Database Contents License</a> where applicable. Agency data retains its source terms. Each city’s downloadable network JSON contains its provenance, timing model and source version; the public JSON is the complete derived database used by the game.</p><p>Sources include agency GTFS, <a href="https://www.citylines.co/data">Citylines</a>, and the <a href="https://github.com/liminalapps/tinytrains">Tiny Trains published network snapshots</a>, derived from the operators credited below.</p><ul>${registry.map((c) => `<li id="${c.slug}"><strong>${escape(c.name)}</strong> — ${c.stations} stations, ${c.lines} lines; ${c.timeModel === "estimated" ? "estimated" : "scheduled"} puzzle times. <a href="${escape(c.source ?? "https://www.mta.info/developers")}">Source</a> · <a href="${c.slug === "nyc" ? "/data/network.json" : `/world-data/${c.slug}/network.json`}">Download network</a><br>${escape(c.license)}${c.attribution.length ? "<br>" + c.attribution.map(escape).join(" · ") : ""}</li>`).join("")}</ul></main></body></html>`;
const sourceDir = new URL("dist/trainrot-world/sources/", root);
fs.mkdirSync(sourceDir, { recursive: true });
fs.writeFileSync(new URL("index.html", sourceDir), sources);
console.log(`Built ${registry.length} city pages and source credits.`);
