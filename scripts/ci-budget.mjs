import { writeFileSync, mkdirSync } from "node:fs";
// Include queue and setup in the budget, rather than timing only the command.
const headers = {
  Authorization: `Bearer ${process.env.GH_TOKEN}`,
  Accept: "application/vnd.github+json",
};
const endpoint = `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
async function get(url) {
  const response = await fetch(url, { headers });
  if (!response.ok)
    throw new Error(`CI timing API returned ${response.status}`);
  return response.json();
}
const run = await get(endpoint);
const { jobs } = await get(`${endpoint}/jobs?per_page=100`);
const job = jobs.find((job) => job.name === "verify");
if (!job) throw new Error("Missing verify job timing");
const elapsedMs = Date.now() - Date.parse(run.created_at);
const waitingMs = Date.parse(job.started_at) - Date.parse(run.created_at);
const receipt = { run: run.html_url, elapsedMs, waitingMs, budgetMs: 60000 };
mkdirSync("test-results/ci-optimization", { recursive: true });
writeFileSync(
  "test-results/ci-optimization/budget.json",
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
if (elapsedMs > receipt.budgetMs)
  throw new Error(
    "Full CI exceeded one minute, including queue and setup; see timing receipt",
  );
