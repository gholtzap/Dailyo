import fs from "node:fs/promises";
import path from "node:path";
import { gameName } from "../dist/game-names.js";
import { rushGames } from "../dist/daily/rush-games.js";

const themeColor = JSON.parse(
  await fs.readFile(new URL("../design/tokens.json", import.meta.url), "utf8"),
).color.paper;

const games = [
  ["trainrot", "trainrot", "Subway routes"],
  ["flagrot", "flags", "Flags"],
  ["langrot", "languages", "Languages"],
  ["Vocabulary", "vocabulary", "Word meanings"],
  ["maprot", "maprot", "City locations"],
  ["yearrot", "yearrot", "Timelines"],
  ["borderrot", "borderrot", "Country routes"],
  ["ladderrot", "ladderrot", "Word ladders"],
  ["cluerot", "cluerot", "Clues"],
  ["scalerot", "scalerot", "Estimates"],
  ["swaprot", "swaprot", "Number sorting"],
  ["skyrot", "skyrot", "Overhead cities"],
  ["pricerot", "pricerot", "Prices"],
  ["skylinerot", "skylinerot", "Skylines"],
  ["zoomrot", "zoomrot", "Close-up objects"],
  ["orderrot", "orderrot", "Ordering"],
  ["countrot", "countrot", "Dot counting"],
  ["trackrot", "trackrot", "Ball tracking"],
  ["anglerot", "anglerot", "Angle estimation"],
  ["temporot", "temporot", "Rhythm"],
  ["splitrot", "splitrot", "Line proportions"],
];
// Match each game's startup fetches so the HTML parser can start them early.
const puzzleData = Object.fromEntries(
  [
    "flags",
    "languages",
    "vocabulary",
    "yearrot",
    "cluerot",
    "scalerot",
    "skyrot",
    "pricerot",
    "skylinerot",
    "zoomrot",
    "orderrot",
  ].map((game) => [game, [`/games/data/${game}.json`]]),
);
puzzleData.maprot = [
  "/games/data/maprot.json",
  "/games/data/map-geometry.json",
];
puzzleData.borderrot = [
  "/games/data/borderrot.json",
  "/games/data/border-map.json",
];
puzzleData.ladderrot = [
  "/games/data/ladderrot.json",
  "/games/data/ladder-words.json",
];
puzzleData.trainrot = [
  "/data/network.json",
  "/data/boroughs.json",
  "/data/challenges.json",
];

async function visit(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.name === "index.html") {
      let html = await fs.readFile(file, "utf8");
      if (!html.includes("site-masthead")) continue;
      const route =
        "/" +
        path
          .relative("dist", directory)
          .split(path.sep)
          .filter(Boolean)
          .join("/") +
        "/";
      const rush = route === "//" || route.startsWith("/rush/"),
        daily = route === "/daily/";
      const current = games.find(([, slug]) => route === `/${slug}/`);
      const links = games
        .filter((game) =>
          rush
            ? rushGames.some(
                (candidate) =>
                  candidate.label.toLowerCase() === game[0].toLowerCase(),
              )
            : game !== current,
        )
        .map(
          ([name, slug, description]) =>
            `<a aria-description="${description}${rush ? " in Rush" : " · Daily and Practice"}" href="${rush ? `/rush/${name.toLowerCase()}/` : `/${slug}/`}"><span>${gameName(name)}</span></a>`,
        )
        .join("\n          ");
      const header = `<header class="site-masthead${rush || daily ? " feed-header" : ""}${daily ? " daily-header" : ""}">
    <a class="site-brand" href="/">dailyo</a>
    <nav class="site-modes" aria-label="Play mode">
      <a href="/daily/" aria-label="Daily mix"${daily ? ' aria-current="page"' : ""}>Daily</a>
      <a href="/rush/"${rush ? ' aria-current="page"' : ""}>Rush</a>
    </nav>
    ${daily ? '<p id="feed-progress" role="status" tabindex="-1"></p>' : ""}
    <details class="site-more${rush || daily ? " feed-directory" : ""}">
      <summary>Games</summary>
      <nav class="site-more-links" aria-label="Games">
          ${links}
          ${rush ? "" : '<a href="/trainrot-world/nyc/"><span>Subway cities</span></a>'}
      </nav>
    </details>
  </header>`;
      html = html.replace(
        /<header class="site-masthead[\s\S]*?<\/header>(?:\s*<h1 class="screen-reader-only">.*?<\/h1>)?/,
        header,
      );
      if (current) {
        const name = gameName(current[0]);
        html = html.replace(
          /<title>.*?<\/title>/,
          `<title>${name} | dailyo</title>`,
        );
        html = html.replace(/(class="game-title">)[^<]*(<)/, `$1${name}$2`);
      } else if (rush) {
        const selected = games.find(
          ([name]) => route === `/rush/${name.toLowerCase()}/`,
        );
        html = html.replace(
          /<title>.*?<\/title>/,
          `<title>${selected ? `${gameName(selected[0])} Rush` : "Rush"} | dailyo</title>`,
        );
      }
      html = html.replace(
        /\s*<a class="world-discover[^"]*"[\s\S]*?<\/a>/g,
        "",
      );
      if (!html.includes('src="/site.js"'))
        html = html.replace(
          "</head>",
          '  <script type="module" src="/site.js"></script>\n</head>',
        );
      html = html.replace(
        "</head>",
        '<link rel="stylesheet" href="/playroom.css">\n</head>',
      );
      html = html
        .replace(
          /<meta name="color-scheme" content="[^"]*">/g,
          '<meta name="color-scheme" content="dark">',
        )
        .replace(
          /<meta name="theme-color" content="[^"]*">/g,
          `<meta name="theme-color" content="${themeColor}">`,
        );
      // Rebuild these hints on every run, including when a generated city page
      // starts from the Trainrot template. Rush hosts preload their child pages.
      html = html.replace(/\s*<link data-puzzle-preload[^>]*>/g, "");
      const city = html.match(/data-world-city="([a-z-]+)"/)?.[1];
      let datasets = current ? (puzzleData[current[1]] ?? []) : [];
      if (city && route !== "/trainrot-world/") {
        const root = city === "nyc" ? "/data" : `/world-data/${city}`;
        datasets = [
          "/world-data/cities.json",
          ...["network", "boroughs", "challenges"].map(
            (name) => `${root}/${name}.json`,
          ),
        ];
      }
      if (datasets.length)
        html = html.replace(
          "</head>",
          datasets
            .map(
              (href) =>
                `  <link data-puzzle-preload rel="preload" as="fetch" href="${href}" crossorigin>`,
            )
            .join("\n") + "\n</head>",
        );
      await fs.writeFile(file, html.replace(/^[ \t]+$/gm, ""));
    }
  }
}
// Every Rush URL serves the same app shell, including in local static servers.
const rushShell = await fs.readFile("dist/index.html", "utf8");
await fs.writeFile("dist/rush/index.html", rushShell);
for (const entry of await fs.readdir("dist/rush", { withFileTypes: true })) {
  if (entry.isDirectory())
    await fs.writeFile(
      path.join("dist/rush", entry.name, "index.html"),
      rushShell,
    );
}
await visit("dist");

// Legacy Rush links lead to their named game instead of a random mixed round.
for (const slug of ["cluerot", "ladderrot"]) {
  await fs.writeFile(
    path.join("dist/rush", slug, "index.html"),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="dark">
<meta name="theme-color" content="${themeColor}"><meta http-equiv="refresh" content="0;url=/${slug}/">
<link rel="canonical" href="/${slug}/"><title>${gameName(slug)} | dailyo</title>
<link rel="stylesheet" href="/design-system.css"><link rel="stylesheet" href="/components.css"></head>
<body><a href="/${slug}/">${gameName(slug)}</a></body></html>`,
  );
}
