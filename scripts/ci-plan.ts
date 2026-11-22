import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";

export type Options = {
  root?: string;
  unit: string[];
  browser: string[];
  full?: boolean;
};
export function planChecks(changed: string[], options: Options) {
  const root = resolve(options.root ?? ".");
  const all = () => ({
    full: true,
    unit: options.unit,
    browser: options.browser,
    reason: "Full validation or unknown input",
  });
  if (options.full) return all();
  const imports = new Map<string, Set<string>>();
  function walk(folder: string) {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      if (
        [
          "node_modules",
          ".git",
          ".cache",
          ".test-build",
          "test-results",
        ].includes(item.name)
      )
        continue;
      const path = resolve(folder, item.name);
      if (item.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(?:[cm]?[jt]s|tsx)$/.test(path)) continue;
      const name = relative(root, path);
      const text = readFileSync(path, "utf8");
      const deps = new Set<string>([name]);
      for (const match of text.matchAll(
        /(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g,
      )) {
        if (!match[1].startsWith(".")) continue;
        let dependency = relative(root, resolve(dirname(path), match[1]));
        if (dependency.startsWith("dist/"))
          dependency = dependency.replace(/^dist\//, "src/");
        if (
          !existsSync(resolve(root, dependency)) &&
          dependency.endsWith(".js")
        )
          dependency = dependency.slice(0, -3) + ".ts";
        deps.add(dependency);
      }
      imports.set(name, deps);
    }
  }
  walk(root);
  function reaches(
    entry: string,
    target: string,
    seen = new Set<string>(),
  ): boolean {
    if (entry === target) return true;
    if (seen.has(entry)) return false;
    seen.add(entry);
    return [...(imports.get(entry) ?? [])].some(
      (dep) => dep !== entry && reaches(dep, target, seen),
    );
  }
  const units = new Set<string>(),
    browsers = new Set<string>();
  for (let file of changed) {
    if (/\.md$/.test(file) && !/(?:AGENTS|CLAUDE)\.md$/.test(file)) continue;
    if (file.startsWith("dist/") && /\.js$/.test(file))
      file = file.replace(/^dist\//, "src/").replace(/\.js$/, ".ts");
    if (
      !existsSync(resolve(root, file)) ||
      !/^(?:src|api|lib|tests)\//.test(file)
    )
      return all();
    const reached = options.unit.filter((test) => reaches(test, file));
    reached.forEach((test) => units.add(test));
    const direct = options.browser.filter((command) =>
      reaches(command.split(" ")[1], file),
    );
    direct.forEach((command) => browsers.add(command));
    // Browser entry points are loaded through HTML and runtime URLs, rather than
    // imported by the driver. Unknown app/resource changes must keep all journeys.
    if (/^(?:src|api|lib)\//.test(file)) {
      if (/^(?:api|lib)\//.test(file))
        options.unit.forEach((test) => units.add(test));
      else options.browser.forEach((command) => browsers.add(command));
    } else if (reached.length === 0 && direct.length === 0) return all();
  }
  return {
    full: false,
    unit: [...units].sort(),
    browser: [...browsers].sort(),
    reason:
      "Import reachability; runtime browser dependencies fall back to full journeys",
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const unit = readdirSync("tests")
    .filter(
      (file) =>
        /\.test\.(?:ts|mjs)$/.test(file) && file !== "nyc-router.test.mjs",
    )
    .map((file) => `tests/${file}`);
  const browser = [
    ...pkg.scripts["test:e2e"].split(" && "),
    pkg.scripts["test:e2e:world"],
  ];
  const base = process.argv[2];
  const changed = base
    ? execFileSync(
        "git",
        [
          "diff",
          "--name-only",
          "--diff-filter=ACDMRTUXB",
          `${base}...HEAD`,
          "-z",
        ],
        { encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean)
    : [];
  console.log(
    JSON.stringify(planChecks(changed, { unit, browser, full: !base })),
  );
}
