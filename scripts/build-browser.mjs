import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return file.endsWith(".ts") && !file.endsWith(".d.ts") ? [file] : [];
  });
}

// Keep the existing module URLs and public exports. The verified .mjs files
// are copied separately; this does not transform their generated proof output.
execFileSync(
  "bun",
  [
    "build",
    "--no-bundle",
    "--minify",
    "--target=browser",
    "--root=src",
    "--outdir=dist",
    "--sourcemap=linked",
    ...sources("src").sort(),
  ],
  { stdio: "inherit" },
);
