// Exercise the workflow's actual HTTP lock fetch, Git checkout and lock verification.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const workflow = Bun.YAML.parse(
  await readFile(".github/workflows/checks.yml", "utf8"),
);
const steps = workflow.jobs.browser.steps;
const start = steps.find(
  (step) => step.name === "Start fetching the exact tested source snapshot",
).run;
const wait = steps.find(
  (step) => step.name === "Require successful source snapshot",
).run;
const root = await mkdtemp(join(tmpdir(), "dailyo-source-"));
function run(script, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-e", "-o", "pipefail", "-c", script], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) =>
      signal
        ? reject(new Error(`Shell terminated: ${signal}`))
        : resolve({ code, output }),
    );
  });
}
try {
  const repo = join(root, "repos/fixture/repo.git");
  await mkdir(repo, { recursive: true });
  execFileSync("git", ["init", "--quiet", repo]);
  await writeFile(join(repo, "bun.lock"), "frozen-lock\n");
  await writeFile(join(repo, "source-marker"), "exact-source\n");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", [
    "-C",
    repo,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  const sha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(
    join(bin, "git"),
    `#!/usr/bin/env bash\nfor argument in "$@"; do\n if [[ "$argument" == fetch ]]; then\n  while [[ ! -f "$RUNNER_TEMP/release-source" ]]; do sleep 0.01; done\n fi\ndone\nexec '${realGit}' "$@"\n`,
  );
  await chmod(join(bin, "git"), 0o755);
  for (const mode of [
    "success",
    "lock-http-error",
    "git-fetch-error",
    "unknown-commit",
    "lock-mismatch",
  ]) {
    const cwd = join(root, mode),
      runtime = join(cwd, "runtime");
    await mkdir(runtime, { recursive: true });
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        if (mode === "lock-http-error")
          return new Response("denied", { status: 403 });
        return new Response(
          mode === "lock-mismatch" ? "wrong-lock\n" : "frozen-lock\n",
        );
      },
    });
    try {
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_TOKEN: "local-test",
        GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
        GITHUB_SERVER_URL: `file://${root}/repos`,
        GITHUB_REPOSITORY:
          mode === "git-fetch-error" ? "fixture/missing" : "fixture/repo",
        GITHUB_SHA:
          mode === "unknown-commit"
            ? "0123456789abcdef0123456789abcdef01234567"
            : sha,
        RUNNER_TEMP: runtime,
      };
      const started = await run(start, cwd, env);
      if (mode === "lock-http-error") {
        assert.notEqual(started.code, 0);
        console.log(`Source snapshot: ${mode} propagated correctly`);
        continue;
      }
      assert.equal(started.code, 0, started.output);
      await assert.rejects(
        access(join(runtime, "trainrot-source.exit")),
        "Bootstrap must return while the source fetch is still pending",
      );
      const completed = run(wait, cwd, env);
      await writeFile(join(runtime, "release-source"), "ready");
      const result = await completed;
      assert.equal(
        result.code === 0,
        mode === "success",
        `${mode}: ${result.output}`,
      );
      if (mode === "success") {
        assert.equal(
          await readFile(join(cwd, "source-marker"), "utf8"),
          "exact-source\n",
        );
        assert.equal(
          execFileSync(realGit, ["-C", cwd, "rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          sha,
        );
      }
      console.log(`Source snapshot: ${mode} propagated correctly`);
    } finally {
      server.stop(true);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
