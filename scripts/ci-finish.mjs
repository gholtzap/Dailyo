import { mkdirSync, writeFileSync } from "node:fs";
const endpoint = `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const headers = {
  Authorization: `Bearer ${process.env.GH_TOKEN}`,
  Accept: "application/vnd.github+json",
};
async function get(url) {
  const response = await fetch(url, { headers });
  if (!response.ok)
    throw new Error(`CI evidence API returned ${response.status}`);
  return response.json();
}
const run = await get(endpoint);
const count = Number(process.env.CI_BROWSER_SHARDS ?? 18);
const required = [
  "proofs",
  "api",
  ...Array.from({ length: count }, (_, i) => `browser (${i + 1})`),
];
const stopAt = Date.now() + 180000;
let checks;
while (Date.now() < stopAt) {
  const { jobs } = await get(`${endpoint}/jobs?per_page=100`);
  checks = required.map((name) => jobs.find((job) => job.name === name));
  if (checks.every((job) => job?.status === "completed")) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!checks?.every((job) => job?.status === "completed"))
  throw new Error("Missing or unfinished required CI jobs");
const elapsedMs = Date.now() - Date.parse(run.created_at);
const receipt = {
  run: run.html_url,
  elapsedMs,
  budgetMs: 60000,
  checks: checks.map((job) => ({ name: job.name, conclusion: job.conclusion })),
};
mkdirSync("test-results/ci-optimization", { recursive: true });
writeFileSync(
  "test-results/ci-optimization/full-run.json",
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
if (checks.some((job) => job.conclusion !== "success"))
  throw new Error("A required correctness check did not pass");
if (elapsedMs > 60000)
  throw new Error("Full CI exceeded one minute, including queue and setup");
