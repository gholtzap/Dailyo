import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
// Reuse only a successful proof job on the exact PR base, with identical inputs.
// A missing receipt, API failure, or changed verifier always runs the full gate.
const base = process.env.PROOF_BASE;
let reuse = false;
if (base && /^[a-f0-9]{40}$/.test(base)) {
  try {
    const inputs = [
      "LAWS.bend",
      "PROOF.bend",
      "verification",
      "src/verified",
      "scripts/verify.mjs",
      "scripts/ci-proofs.mjs",
      ".github/workflows/checks.yml",
      "scripts/check-proof-failures.mjs",
      // Markdown explains the rules but is never read by the verifier.
      ":(exclude,glob)verification/**/*.md",
    ];
    const changed = execFileSync(
      "git",
      ["diff", "--name-only", base, "HEAD", "--", ...inputs],
      { encoding: "utf8" },
    ).trim();
    if (!changed) {
      const endpoint = `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}`;
      const headers = {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
      };
      const response = await fetch(
        `${endpoint}/actions/workflows/checks.yml/runs?head_sha=${base}&event=push&per_page=10`,
        { headers },
      );
      if (!response.ok) throw new Error(`Baseline run API: ${response.status}`);
      const { workflow_runs: runs } = await response.json();
      for (const run of runs.filter(
        (run) => run.head_sha === base && run.head_branch === "main",
      )) {
        const response = await fetch(
          `${endpoint}/actions/runs/${run.id}/jobs?per_page=100`,
          { headers },
        );
        if (!response.ok)
          throw new Error(`Baseline proof API: ${response.status}`);
        const { jobs } = await response.json();
        if (
          jobs.some(
            (job) => job.name === "proofs" && job.conclusion === "success",
          )
        ) {
          console.log(
            `Identical proof inputs already verified: ${run.html_url}`,
          );
          reuse = true;
          break;
        }
      }
    }
  } catch (error) {
    console.log(
      `Running full proofs because reuse could not be established: ${error.message}`,
    );
  }
}
appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${reuse}\n`);
