// Exercise the workflow's actual curl/tar/checksum commands over real HTTP.
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
    const process = spawn("bash", ["-e", "-o", "pipefail", "-c", script], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });
    let output = "";
    process.stdout.on("data", (chunk) => (output += chunk));
    process.stderr.on("data", (chunk) => (output += chunk));
    process.on("error", reject);
    process.on("close", (code, signal) =>
      signal
        ? reject(new Error(`Shell terminated: ${signal}`))
        : resolve({ code, output }),
    );
  });
}
try {
  const archiveRoot = join(root, "archive");
  await mkdir(join(archiveRoot, "tree"), { recursive: true });
  await writeFile(join(archiveRoot, "tree/bun.lock"), "frozen-lock\n");
  await writeFile(join(archiveRoot, "tree/source-marker"), "exact-source\n");
  const archive = execFileSync("tar", ["-czf", "-", "-C", archiveRoot, "tree"]);
  for (const mode of [
    "success",
    "lock-http-error",
    "archive-http-error",
    "corrupt-archive",
    "lock-mismatch",
  ]) {
    const cwd = join(root, mode),
      runtime = join(cwd, "runtime");
    await mkdir(runtime, { recursive: true });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        if (new URL(request.url).pathname.includes("/contents/")) {
          if (mode === "lock-http-error")
            return new Response("denied", { status: 403 });
          return new Response(
            mode === "lock-mismatch" ? "wrong-lock\n" : "frozen-lock\n",
          );
        }
        await gate;
        if (mode === "archive-http-error")
          return new Response("failed", { status: 503 });
        return new Response(
          mode === "corrupt-archive" ? "not an archive" : archive,
        );
      },
    });
    try {
      const env = {
        ...process.env,
        GH_TOKEN: "local-test",
        GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
        GITHUB_REPOSITORY: "fixture/repo",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
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
        "Bootstrap must return while the archive download is still pending",
      );
      const completed = run(wait, cwd, env);
      release();
      const result = await completed;
      assert.equal(
        result.code === 0,
        mode === "success",
        `${mode}: ${result.output}`,
      );
      if (mode === "success")
        assert.equal(
          await readFile(join(cwd, "source-marker"), "utf8"),
          "exact-source\n",
        );
      console.log(`Source snapshot: ${mode} propagated correctly`);
    } finally {
      release();
      server.stop(true);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
