import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "ci-finish-")),
  script = resolve("scripts/ci-finish.mjs");
let mode = "success",
  calls = 0;
const cacheHeaders = [];
const server = createServer((req, res) => {
  cacheHeaders.push(req.headers["cache-control"]);
  res.setHeader("content-type", "application/json");
  if (mode === "api-error") {
    res.writeHead(503);
    res.end("{}");
    return;
  }
  if (req.url.includes("/jobs?")) {
    calls++;
    const jobs = ["proofs", "api", "browser (1)"].map((name) => ({
      name,
      run_attempt: mode.startsWith("rerun-")
        ? 2
        : mode === "wrong-attempt"
          ? 2
          : 1,
      status: "completed",
      conclusion:
        ["failure", "cancelled", "skipped"].includes(mode) && name === "api"
          ? mode
          : "success",
    }));
    res.end(
      JSON.stringify({
        jobs: mode === "missing-then-success" && calls === 1 ? [] : jobs,
      }),
    );
  } else
    res.end(
      JSON.stringify({
        html_url: "fixture://run",
        run_attempt: mode.startsWith("rerun-") ? 2 : 1,
        run_started_at: new Date(
          Date.now() -
            (mode === "rerun-over-budget"
              ? 61000
              : mode === "rerun-cleanup-reserve"
                ? 57000
                : 0),
        ).toISOString(),
        created_at: new Date(
          Date.now() -
            (mode.startsWith("rerun-")
              ? 120000
              : mode === "over-budget"
                ? 61000
                : mode === "cleanup-reserve"
                  ? 57000
                  : 0),
        ).toISOString(),
      }),
    );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
async function probe(scenario, expected) {
  mode = scenario;
  calls = 0;
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: {
        ...process.env,
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        GITHUB_REPOSITORY: "fixture/repo",
        GITHUB_RUN_ID: "1",
        GH_TOKEN: "fixture",
        GITHUB_RUN_ATTEMPT: scenario.startsWith("rerun-") ? "2" : "1",
        CI_BROWSER_SHARDS: "1",
      },
      stdio: "pipe",
    });
    child.once("error", (error) => resolve({ status: 1, error }));
    child.once("exit", (status) => resolve({ status }));
  });
  assert.equal(result.status === 0, expected, scenario);
  assert.ok(
    cacheHeaders.every((value) => value === "no-cache"),
    "Live gate requests must revalidate cacheable job status responses",
  );
  if (scenario === "missing-then-success")
    assert.ok(calls >= 2, "A missing required job cannot pass");
}
try {
  for (const scenario of ["success", "missing-then-success", "rerun-success"])
    await probe(scenario, true);
  for (const scenario of [
    "failure",
    "cancelled",
    "skipped",
    "over-budget",
    "cleanup-reserve",
    "rerun-over-budget",
    "rerun-cleanup-reserve",
    "wrong-attempt",
    "api-error",
  ])
    await probe(scenario, false);
  console.log(
    "Current-attempt CI gate: valid reruns use their own start; missing, wrong-attempt, failed, cancelled, skipped, over-budget and unavailable evidence cannot pass.",
  );
} finally {
  server.close();
  rmSync(root, { recursive: true, force: true });
}
