import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { planChecks } from "./ci-plan.js";

const base = process.argv[2];
const local = process.argv.includes("--local");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const unit: string[] = pkg.scripts["test:unit"].split(" ").slice(2);
const browser: string[] = [
  ...pkg.scripts["test:e2e"].split(" && "),
  pkg.scripts["test:e2e:world"],
];
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
const plan = planChecks(changed, { unit, browser, full: !base });
const formatBase = process.env.FORMAT_BASE;
const formatChanged = formatBase
  ? execFileSync("git", ["diff", "--name-only", `${formatBase}...HEAD`, "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean)
  : changed;
const formatted = formatChanged.filter(
  (file) =>
    existsSync(file) &&
    !file.startsWith("dist/") &&
    /\.(?:[cm]?[jt]s|tsx|json|ya?ml|md|toml)$/.test(file),
);
const tasks: [string, string[]][] = [
  ["lint", ["bun", "run", "lint"]],
  ["typecheck", ["bun", "check", "--no-script"]],
  ...(formatted.length
    ? [
        ["format", ["bun", "fmt", "--no-script", "--check", ...formatted]] as [
          string,
          string[],
        ],
      ]
    : []),
  ...(!local
    ? [["build", ["bun", "run", "build:ci"]] as [string, string[]]]
    : []),
  ...(!local && plan.unit.length
    ? [["tests", ["bun", "test", ...plan.unit]] as [string, string[]]]
    : []),
];
const started = performance.now();
const results = await Promise.all(
  tasks.map(
    ([name, [command, ...args]]) =>
      new Promise<{ name: string; status: number; durationMs: number }>(
        (resolve) => {
          const start = performance.now();
          const child = spawn(command, args, { stdio: "inherit" });
          child.once("error", (error) => {
            console.error(error);
            resolve({ name, status: 1, durationMs: performance.now() - start });
          });
          child.once("exit", (status) =>
            resolve({
              name,
              status: status ?? 1,
              durationMs: performance.now() - start,
            }),
          );
        },
      ),
  ),
);
const durationMs = performance.now() - started;
mkdirSync("test-results/ci-optimization", { recursive: true });
writeFileSync(
  "test-results/ci-optimization/feedback.json",
  JSON.stringify(
    { changed, plan, results, durationMs, budgetMs: local ? 9000 : 60000 },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    durationMs,
    results,
    selectedUnitTests: plan.unit.length,
    fullMergeValidation: "Required separately; never replaced by feedback",
  }),
);
if (
  results.some((result) => result.status !== 0) ||
  durationMs > (local ? 9000 : 60000)
)
  process.exitCode = 1;
