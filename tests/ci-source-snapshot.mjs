// Exercise the workflow's actual asynchronous source fetch and content checks.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const workflow = Bun.YAML.parse(
  await readFile(".github/workflows/checks.yml", "utf8"),
);
const steps = workflow.jobs.browser.steps;
const start = steps.find(
  (s) => s.name === "Start fetching the exact tested source snapshot",
).run;
const wait = steps.find(
  (s) => s.name === "Require successful source snapshot",
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
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    child.on("error", reject);
    child.on("close", (code, signal) =>
      signal
        ? reject(new Error(`Shell terminated: ${signal}`))
        : resolve({ code, output }),
    );
  });
}
const blob = (bytes) =>
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
try {
  const repo = join(root, "repos/fixture/repo.git");
  await mkdir(repo, { recursive: true });
  execFileSync("git", ["init", "--quiet", repo]);
  const files = {
    "bun.lock": "frozen-lock\n",
    "source-marker": "exact-source\n",
  };
  for (const [name, content] of Object.entries(files))
    await writeFile(join(repo, name), content);
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
  const treeSha = execFileSync(
    "git",
    ["-C", repo, "rev-parse", "HEAD^{tree}"],
    { encoding: "utf8" },
  ).trim();
  const archive = execFileSync("git", [
    "-C",
    repo,
    "archive",
    "--format=tar.gz",
    "--prefix=fixture/",
    sha,
  ]);
  const altered = join(root, "altered");
  await mkdir(altered);
  for (const [name, content] of Object.entries({
    ...files,
    "source-marker": "tampered\n",
  }))
    await writeFile(join(altered, name), content);
  const corrupt = execFileSync("tar", ["-czf", "-", "-C", altered, "."]);
  const tree = Object.entries(files).map(([path, content]) => ({
    path,
    type: "blob",
    mode: "100644",
    sha: blob(Buffer.from(content)),
  }));
  for (const mode of [
    "success",
    "lock-http-error",
    "archive-http-error",
    "unknown-commit",
    "lock-mismatch",
    "content-mismatch",
    "truncated-tree",
  ]) {
    const cwd = join(root, mode),
      runtime = join(cwd, "runtime");
    await mkdir(runtime, { recursive: true });
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path.includes("/contents/bun.lock"))
          return new Response(
            mode === "lock-mismatch" ? "wrong-lock\n" : "frozen-lock\n",
            { status: mode === "lock-http-error" ? 403 : 200 },
          );
        while (true) {
          try {
            await access(join(runtime, "release-source"));
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 5));
          }
        }
        if (path.includes("/commits/"))
          return Response.json(
            { sha, commit: { tree: { sha: treeSha } } },
            { status: mode === "unknown-commit" ? 404 : 200 },
          );
        if (path.includes("/git/trees/"))
          return Response.json({
            sha: treeSha,
            truncated: mode === "truncated-tree",
            tree,
          });
        if (path.includes("/tarball/"))
          return new Response(mode === "content-mismatch" ? corrupt : archive, {
            status: mode === "archive-http-error" ? 503 : 200,
          });
        return new Response("missing", { status: 404 });
      },
    });
    try {
      const env = {
        ...process.env,
        GH_TOKEN: "local-test",
        GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
        GITHUB_SERVER_URL: `file://${root}/repos`,
        GITHUB_REPOSITORY: "fixture/repo",
        GITHUB_SHA:
          mode === "unknown-commit"
            ? "0123456789abcdef0123456789abcdef01234567"
            : sha,
        RUNNER_TEMP: runtime,
      };
      const started = await run(start, cwd, env);
      if (mode === "lock-http-error") {
        assert.notEqual(started.code, 0);
        continue;
      }
      assert.equal(started.code, 0, started.output);
      await assert.rejects(
        access(join(runtime, "trainrot-source.exit")),
        "Bootstrap must return while source verification remains pending",
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
          (await readFile(join(runtime, "trainrot-source.sha"), "utf8")).trim(),
          sha,
        );
      }
      console.log(`Source snapshot: ${mode} enforced`);
    } finally {
      server.stop(true);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
