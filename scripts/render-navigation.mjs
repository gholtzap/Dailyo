import fs from "node:fs/promises";
import path from "node:path";
import { gameName } from "../dist/game-names.js";
import { rushGames } from "../dist/daily/rush-games.js";

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
          <a class="repository-link" href="https://github.com/gholtzap/Dailyo" target="_blank" rel="noopener noreferrer">GitHub repository</a>
      </nav>
    </details>
  </header>`;
      html = html.replace(
        /<header class="site-masthead[\s\S]*?<\/header>(?:\s*<h1 class="screen-reader-only">.*?<\/h1>)?/,
        header,
      );
      if (!html.includes('src="/site.js"'))
        html = html.replace(
          "</head>",
          '  <script type="module" src="/site.js"></script>\n</head>',
        );
      if (!html.includes('href="/playroom.css"'))
        html = html.replace(
          "</head>",
          '<link rel="stylesheet" href="/playroom.css">\n</head>',
        );
      html = html
        .replace(
          /<meta name="color-scheme" content="dark">/g,
          '<meta name="color-scheme" content="light">',
        )
        .replace(
          /<meta name="theme-color" content="#1c1d1f">/g,
          '<meta name="theme-color" content="#fff8ec">',
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
