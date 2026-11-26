import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, sep, extname } from "node:path";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

// Run only with the disposable loopback database used by integration checks.
const database = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(database.hostname))
  throw new Error("A loopback test database is required");
process.env.DAILY_SCORE_SECRET ??= randomBytes(32).toString("hex");
mkdirSync(".test-build/dist/games", { recursive: true });
cpSync("dist/data", ".test-build/dist/data", { recursive: true });
cpSync("dist/games/data", ".test-build/dist/games/data", { recursive: true });
const { default: handler } = await import("../.test-build/api/daily-score.js");
const { default: maintenance } =
  await import("../.test-build/api/score-maintenance.js");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};
const root = resolve("dist");
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/api/score-maintenance") {
    void maintenance(req, res);
    return;
  }
  if (path === "/api/daily-score") {
    void handler(req, res);
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  const file = resolve(
    root,
    "." + decodeURIComponent(path) + (path.endsWith("/") ? "index.html" : ""),
  );
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const bytes = readFileSync(file);
    res
      .writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(Number(process.env.PORT ?? 4174), "127.0.0.1", () =>
  console.log("Disposable score API ready"),
);
