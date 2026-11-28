// Exercise the workflow's asynchronous source fetch against real Git objects.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
  cp,
  chmod,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const workflow = Bun.YAML.parse(
  await readFile(".github/workflows/checks.yml", "utf8"),
);
const steps = workflow.jobs.browser.steps;
const prefetch =
  steps.find((s) => s.name === "Prefetch the frozen source lock")?.run ?? "";
const start =
  prefetch +
  "\n" +
  steps.find(
    (s) => s.name === "Start fetching the exact tested source snapshot",
  ).run;
const wait = steps.find(
  (s) => s.name === "Require successful source snapshot",
).run;
const root = await mkdtemp(join(tmpdir(), "dailyo-source-"));
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
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
try {
  const original = join(root, "original");
  await mkdir(original);
  git("init", "--quiet", original);
  await writeFile(join(original, "bun.lock"), "frozen-lock\n");
  await writeFile(join(original, "source-marker"), "exact-source\n");
  await writeFile(join(original, "executable"), "#!/bin/sh\nexit 0\n");
  await chmod(join(original, "executable"), 0o755);
  git("-C", original, "add", ".");
  git(
    "-C",
    original,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );
  const sourceSha = git("-C", original, "rev-parse", "HEAD"),
    blob = git("-C", original, "rev-parse", "HEAD:source-marker");
  const bin = join(root, "bin");
  await mkdir(bin);
  // Keep the fetch pending deterministically; the wrapper then executes real Git.
  const gitPath = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  await writeFile(
    join(bin, "git"),
    `#!/bin/sh\nwhile [ ! -f "$RUNNER_TEMP/release-source" ]; do sleep 0.01; done\nexec "${gitPath}" "$@"\n`,
  );
  await chmod(join(bin, "git"), 0o755);
  for (const mode of [
    "success",
    "warm-cache",
    "corrupt-cache",
    "invalid-cache-base",
    "missing-cache-base",
    "lock-http-error",
    "source-unavailable",
    "unknown-commit",
    "lock-mismatch",
    "corrupt-object",
    "missing-object",
    "unsupported-symlink",
  ]) {
    const cwd = join(root, mode),
      runtime = join(cwd, "runtime"),
      remotes = join(root, `remotes-${mode}`),
      repo = join(remotes, "fixture/repo.git");
    await mkdir(runtime, { recursive: true });
    await cp(original, repo, { recursive: true });
    let sha = sourceSha;
    if (
      [
        "warm-cache",
        "corrupt-cache",
        "invalid-cache-base",
        "missing-cache-base",
      ].includes(mode)
    ) {
      await writeFile(join(repo, "source-marker"), "updated-source\n");
      git("-C", repo, "add", ".");
      git(
        "-C",
        repo,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "updated source",
      );
      sha = git("-C", repo, "rev-parse", "HEAD");
      await cp(join(original, ".git/objects"), join(cwd, ".git/objects"), {
        recursive: true,
      });
      if (mode !== "missing-cache-base")
        await writeFile(
          join(cwd, ".git/source-cache-base"),
          mode === "invalid-cache-base" ? "invalid" : sourceSha,
        );
      if (mode === "corrupt-cache") {
        const cached = join(
          cwd,
          ".git/objects",
          blob.slice(0, 2),
          blob.slice(2),
        );
        await chmod(cached, 0o644);
        await writeFile(cached, "corrupt cached object");
      }
    }
    const object = join(repo, ".git/objects", blob.slice(0, 2), blob.slice(2));
    if (mode === "corrupt-object") {
      await chmod(object, 0o644);
      await writeFile(object, "not-a-git-object");
    }
    if (mode === "missing-object") await rm(object);
    if (mode === "unsupported-symlink") {
      await symlink("source-marker", join(repo, "unexpected-link"));
      git("-C", repo, "add", ".");
      git(
        "-C",
        repo,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "unsupported entry",
      );
      sha = git("-C", repo, "rev-parse", "HEAD");
    }
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname.includes("/contents/bun.lock"))
          return new Response(
            mode === "lock-mismatch" ? "wrong-lock\n" : "frozen-lock\n",
            { status: mode === "lock-http-error" ? 403 : 200 },
          );
        return new Response("missing", { status: 404 });
      },
    });
    try {
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_TOKEN: "local-test",
        GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
        GITHUB_SERVER_URL: `file://${mode === "source-unavailable" ? join(root, "absent") : remotes}`,
        GITHUB_REPOSITORY: "fixture/repo",
        GITHUB_SHA:
          mode === "unknown-commit"
            ? "0123456789abcdef0123456789abcdef01234567"
            : sha,
        RUNNER_TEMP: runtime,
        GIT_TRACE_PACKET: join(runtime, "packets"),
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
        ["success", "warm-cache"].includes(mode),
        `${mode}: ${result.output}`,
      );
      if (["success", "warm-cache"].includes(mode)) {
        assert.equal(
          await readFile(join(cwd, "source-marker"), "utf8"),
          mode === "warm-cache" ? "updated-source\n" : "exact-source\n",
        );
        assert.equal(
          (await readFile(join(runtime, "trainrot-source.sha"), "utf8")).trim(),
          sha,
        );
        assert.equal(git("-C", cwd, "rev-parse", "HEAD"), sha);
        assert.equal(
          git("-C", cwd, "ls-files", "--stage", "executable").split(" ")[0],
          "100755",
        );
      }
      if (mode === "warm-cache")
        assert.match(
          await readFile(join(runtime, "packets"), "utf8"),
          new RegExp(`have ${sourceSha}`),
          "Warm fetch must negotiate from the verified cached commit",
        );
      console.log(`Source snapshot: ${mode} enforced`);
    } finally {
      server.stop(true);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
