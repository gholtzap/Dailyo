import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const root = mkdtempSync(join(tmpdir(), "proof-reuse-")),
  script = resolve("scripts/ci-proofs.mjs");
const git = (...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=CI fixture", "-c", "user.email=ci@example.test", ...args],
    { cwd: root, encoding: "utf8" },
  ).trim();
let baseline = "",
  healthy = true;
const server = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (!healthy) {
    res.writeHead(503);
    res.end("{}");
    return;
  }
  res.end(
    JSON.stringify(
      req.url.includes("/jobs")
        ? { jobs: [{ name: "proofs", conclusion: "success" }] }
        : {
            workflow_runs: [
              {
                id: 1,
                head_sha: baseline,
                head_branch: "main",
                html_url: "fixture://verified",
              },
            ],
          },
    ),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
async function probe(expected) {
  const output = join(root, "output");
  writeFileSync(output, "");
  const status = await new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: {
        ...process.env,
        PROOF_BASE: baseline,
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        GITHUB_REPOSITORY: "fixture/repo",
        GH_TOKEN: "fixture",
        GITHUB_OUTPUT: output,
      },
      stdio: "pipe",
    });
    child.once("exit", resolve);
  });
  assert.equal(status, 0);
  assert.equal(readFileSync(output, "utf8"), `reuse=${expected}\n`);
}
try {
  git("init", "-b", "main");
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "verification/nested"), { recursive: true });
  writeFileSync(join(root, "verification/README.md"), "documentation");
  writeFileSync(join(root, "verification/nested/README.md"), "documentation");
  writeFileSync(join(root, "verification/train.bend"), "proof");
  writeFileSync(join(root, "verification/toolchain.json"), "{}");
  writeFileSync(join(root, "scripts/ci-proofs.mjs"), "reuse checker");
  writeFileSync(join(root, "LAWS.bend"), "base");
  writeFileSync(join(root, "scripts/verify.mjs"), "base");
  git("add", ".");
  git("commit", "-m", "base");
  baseline = git("rev-parse", "HEAD");
  await probe(true);
  for (const file of [
    "verification/README.md",
    "verification/nested/README.md",
  ]) {
    git("reset", "--hard", baseline);
    writeFileSync(join(root, file), "updated documentation");
    git("commit", "-am", "documentation only");
    await probe(true);
  }
  for (const file of [
    "verification/train.bend",
    "verification/toolchain.json",
    "scripts/ci-proofs.mjs",
  ]) {
    git("reset", "--hard", baseline);
    writeFileSync(join(root, file), "changed executable input");
    git("commit", "-am", "proof input changed");
    await probe(false);
  }
  git("reset", "--hard", baseline);
  healthy = false;
  await probe(false);
  healthy = true;
  writeFileSync(join(root, "LAWS.bend"), "broken");
  git("commit", "-am", "changed proof");
  await probe(false);
  git("reset", "--hard", baseline);
  writeFileSync(join(root, "scripts/verify.mjs"), "changed");
  git("commit", "-am", "changed verifier");
  await probe(false);
  console.log(
    "Proof reuse requires identical inputs and a successful base receipt; proof edits, verifier edits and missing API evidence run full proofs.",
  );
} finally {
  server.close();
  rmSync(root, { recursive: true, force: true });
}
