import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planChecks } from "../scripts/ci-plan.js";

// A selector must not omit transitive callers, unknown inputs, or test helpers.
test("PR feedback follows imports and falls back safely for unknown inputs", () => {
  const root = mkdtempSync(join(tmpdir(), "dailyo-plan-"));
  const put = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    put("src/shared.ts", "export const value = 1;");
    put("src/consumer.ts", "export {value} from './shared.js';");
    put(
      "tests/a.test.ts",
      "import {value} from '../src/consumer.js'; import {test} from 'bun:test'; import assert from 'node:assert/strict'; test('value',()=>assert.equal(value,1));",
    );
    put("tests/b.test.ts", "");
    put("tests/helper.mjs", "");
    put("tests/browser.mjs", "import './helper.mjs';");
    const options = {
      root,
      unit: ["tests/a.test.ts", "tests/b.test.ts"],
      browser: ["node tests/browser.mjs"],
    };
    assert.deepEqual(planChecks(["src/shared.ts"], options).unit, [
      "tests/a.test.ts",
    ]);
    assert.deepEqual(planChecks(["tests/helper.mjs"], options).browser, [
      "node tests/browser.mjs",
    ]);
    assert.equal(planChecks(["new-unknown-input.json"], options).full, true);
    assert.equal(planChecks(["bun.lock"], options).full, true);
    assert.equal(planChecks(["README.md"], options).unit.length, 0);
    assert.equal(planChecks(["src/deleted.ts"], options).full, true);
    assert.equal(
      planChecks(["src/shared.ts"], { ...options, full: true }).unit.length,
      2,
    );
    put("src/shared.ts", "export const value = 2;");
    const selected = planChecks(["src/shared.ts"], options).unit;
    assert.notEqual(
      spawnSync("bun", ["test", ...selected.map((file) => "./" + file)], {
        cwd: root,
      }).status,
      0,
      "A breaking transitive dependency must fail selected tests",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
