// Exercise the actual workflow shell: asynchronous startup must propagate failures.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const workflow = Bun.YAML.parse(
  await readFile(".github/workflows/checks.yml", "utf8"),
);
const steps = workflow.jobs.api.steps;
const start = steps.find(
  (step) => step.name === "Start PostgreSQL alongside runner setup",
).run;
const wait = steps.find(
  (step) => step.name === "Require healthy PostgreSQL",
).run;
const cleanup = steps.find((step) => step.name === "Remove PostgreSQL");
assert.equal(cleanup.if, "always()");
const root = await mkdtemp(join(tmpdir(), "dailyo-postgres-"));
function run(script, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-e", "-o", "pipefail", "-c", script], {
      cwd,
      env,
      timeout: 10000,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}
try {
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(
    join(bin, "docker"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$RUNNER_TEMP/docker-calls"
case "$1" in
  run)
    while [[ ! -f "$RUNNER_TEMP/release-postgres" ]]; do sleep 0.01; done
    if [[ "$POSTGRES_TEST_MODE" == pull-failure ]]; then exit 23; fi
    touch "$RUNNER_TEMP/container"
    ;;
  exec)
    if [[ "$POSTGRES_TEST_MODE" == health-failure ]]; then exit 1; fi
    ;;
  container) test -f "$RUNNER_TEMP/container" ;;
  rm) rm "$RUNNER_TEMP/container" ;;
esac
`,
  );
  await chmod(join(bin, "docker"), 0o755);
  // Keep failed readiness bounded in the fixture without changing the workflow timeout.
  await writeFile(
    join(bin, "sleep"),
    "#!/usr/bin/env bash\n/bin/sleep 0.005\n",
  );
  await chmod(join(bin, "sleep"), 0o755);
  for (const mode of ["success", "pull-failure", "health-failure"]) {
    const cwd = join(root, mode);
    await mkdir(cwd);
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: cwd,
      POSTGRES_TEST_MODE: mode,
    };
    const started = await run(start, cwd, env);
    assert.equal(started.code, 0, started.output);
    await assert.rejects(
      access(join(cwd, "dailyo-postgres.exit")),
      "Startup must overlap subsequent setup",
    );
    await writeFile(join(cwd, "release-postgres"), "ready");
    const result = await run(wait, cwd, env);
    assert.equal(
      result.code === 0,
      mode === "success",
      `${mode}: ${result.output}`,
    );
    assert.equal((await run(cleanup.run, cwd, env)).code, 0);
    await assert.rejects(
      access(join(cwd, "container")),
      "Always remove the database container",
    );
    const calls = await readFile(join(cwd, "docker-calls"), "utf8");
    assert.match(calls, /postgres:17-alpine/);
    assert.match(calls, /127\.0\.0\.1:5432:5432/);
    if (mode !== "pull-failure")
      assert.match(calls, /rm --force dailyo-ci-postgres/);
    console.log(`PostgreSQL startup: ${mode} propagated and cleaned up`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
