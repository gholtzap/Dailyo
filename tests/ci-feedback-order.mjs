import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const bun = execFileSync("which", ["bun"], { encoding: "utf8" }).trim();
const entry = new URL("../scripts/ci-feedback.ts", import.meta.url).pathname;
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "dailyo-feedback-"));
try {
  await fs.mkdir(path.join(fixture, "bin"));
  await fs.mkdir(path.join(fixture, "verification"));
  await fs.writeFile(
    path.join(fixture, "verification/generated.json"),
    ' {"outputs":{}}',
  );
  await fs.writeFile(
    path.join(fixture, "package.json"),
    JSON.stringify({
      scripts: {
        "test:unit": "bun test test.mjs",
        "test:e2e": "node browser.mjs",
        "test:e2e:world": "node world.mjs",
      },
    }),
  );
  await fs.writeFile(
    path.join(fixture, "bin/bun"),
    `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
const task=args[0]==='test'?'tests':args[0]==='check'?'typecheck':args[1]==='build:ci'?'build':args[1]==='lint'?'lint':'contracts';
(async()=>{
 if(task==='lint'&&!fs.existsSync('build.done'))process.exit(19);
 if(task==='build'||task==='tests'){await new Promise(r=>setTimeout(r,100));fs.writeFileSync(task+'.done','done');}
 process.exit(process.env.DAILYO_TEST_FAIL===task?7:0);
})();
`,
    { mode: 0o755 },
  );
  for (const failure of ["", "build", "tests", "lint", "typecheck"]) {
    for (const task of ["build", "tests"])
      await fs.rm(path.join(fixture, task + ".done"), { force: true });
    const result = spawnSync(bun, [entry], {
      cwd: fixture,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: path.join(fixture, "bin") + path.delimiter + process.env.PATH,
        DAILYO_TEST_FAIL: failure,
      },
    });
    assert.equal(
      result.status,
      failure ? 1 : 0,
      `${failure || "success"}: ${result.stdout}\n${result.stderr}`,
    );
    const receipt = JSON.parse(
      await fs.readFile(
        path.join(fixture, "test-results/ci-optimization/feedback.json"),
        "utf8",
      ),
    );
    assert.equal(
      receipt.results.find((r) => r.name === "lint").status,
      failure === "lint" ? 7 : 0,
      "Lint runs after generated-file writers finish",
    );
    if (failure)
      assert.equal(
        receipt.results.find((r) => r.name === failure).status,
        7,
        "The original failure stays visible",
      );
  }
  console.log(
    "CI feedback waits for generated artifacts and propagates build, test, lint and typecheck failures.",
  );
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
