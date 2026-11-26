import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Exercise the actual authoring/build/check CLI in a disposable project. These
// are architecture failures that screenshots cannot detect reliably.
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dailyo-design-"));
const write = async (file, text) => {
  const destination = path.join(directory, file);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, text);
};
const run = (...args) =>
  spawnSync(
    process.execPath,
    [path.join(directory, "scripts/design-system.mjs"), ...args],
    { encoding: "utf8" },
  );
const tokens = {
  color: { "color-canvas": "#0b1428", "color-text": "#f3f7ff" },
  font: {
    "font-sans": "sans-serif",
    "font-size-13": "13px",
    "font-weight-regular": "400",
  },
  semantic: { ink: "var(--color-text)", paper: "var(--color-canvas)" },
  breakpoint: { "breakpoint-mobile": "700px" },
  space: { "space-2": "8px" },
};
const good =
  ".example { padding: var(--space-2); color: var(--ink); } @media(max-width:breakpoint(mobile)){.example{display:block}}\n";
const receipt = [];
try {
  await write(
    "scripts/design-system.mjs",
    await fs.readFile(
      new URL("../scripts/design-system.mjs", import.meta.url),
      "utf8",
    ),
  );
  await write("design/tokens.json", JSON.stringify(tokens));
  await write("design/styles/test.css", good);
  await write("src/test.ts", "export {};\n");
  await write("dist/test.css", "");
  await write(
    "dist/index.html",
    '<!doctype html><html><head><meta name="theme-color" content="#ffffff"><link rel="stylesheet" href="/test.css"></head><body></body></html>',
  );
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    await fs.readFile(path.join(directory, "dist/test.css"), "utf8"),
    /max-width:700px/,
  );
  assert.match(
    await fs.readFile(path.join(directory, "dist/index.html"), "utf8"),
    /content="#0b1428"><link rel="stylesheet" href="\/design-system.css">/,
  );
  assert.equal(run("--check").status, 0, "Fresh generated output must pass");
  const html = await fs.readFile(
    path.join(directory, "dist/index.html"),
    "utf8",
  );
  assert.equal(run().status, 0);
  assert.equal(
    await fs.readFile(path.join(directory, "dist/index.html"), "utf8"),
    html,
    "Build must be idempotent",
  );
  receipt.push(
    "generation, breakpoint expansion, theme metadata, stylesheet ordering and idempotence",
  );

  for (const [name, css] of [
    ["raw colour", ".x { color: #ff0000; }"],
    ["functional colour", ".x { background: rgb(1 2 3); }"],
    ["keyword colour", ".x { color: red; }"],
    ["raw spacing", ".x { padding: 17px; }"],
    ["percentage spacing", ".x { gap: 7%; }"],
    ["raw opacity", ".x { opacity: .43; }"],
    ["raw layer", ".x { z-index: 27; }"],
    ["raw font", ".x { font-size: 15px; }"],
    ["font shorthand", ".x { font: bold 1rem sans-serif; }"],
    ["raw duration", ".x { transition: opacity 123ms; }"],
    ["unknown token", ".x { padding: var(--missing); }"],
    ["new local token", ".x { --random: var(--space-2); }"],
    [
      "unknown breakpoint",
      "@media(max-width:breakpoint(missing)){.x{display:block}}",
    ],
    ["raw radius", ".x { border-radius: 37%; }"],
    [
      "shadow outside recipe",
      ".x { box-shadow: 0 0 var(--space-2) var(--ink); }",
    ],
  ]) {
    await write("design/styles/test.css", css);
    result = run();
    assert.equal(
      result.status,
      1,
      `${name} must be rejected: ${result.stdout}`,
    );
    receipt.push(`rejected ${name}`);
  }
  await write("design/styles/test.css", good);
  for (const source of [
    'ctx.fillStyle = "#ff0000";',
    'node.style.padding = "17px";',
    'node.style.setProperty("--random", value);',
  ]) {
    await write("src/test.ts", source);
    assert.equal(
      run().status,
      1,
      `Renderer bypass must be rejected: ${source}`,
    );
  }
  await write("src/test.ts", "export {};\n");
  await write(
    "design/tokens.json",
    JSON.stringify({
      ...tokens,
      semantic: { ink: "var(--paper)", paper: "var(--ink)" },
    }),
  );
  assert.equal(run().status, 1, "Cyclic token references must be rejected");
  await write("design/tokens.json", JSON.stringify(tokens));
  await write("dist/test.css", "/* drift */");
  assert.equal(
    run("--check").status,
    1,
    "Manual changes to generated CSS must be rejected",
  );
  assert.equal(run().status, 0);
  await write("dist/rogue.css", ".x{}");
  assert.equal(run().status, 1, "Unowned stylesheets must be rejected");
  await fs.rm(path.join(directory, "dist/rogue.css"));
  await write(
    "dist/index.html",
    '<link rel="stylesheet" href="/test.css"><div style="padding:17px"></div>',
  );
  assert.equal(run().status, 1, "Inline HTML styles must be rejected");
  receipt.push(
    "rejected renderer bypasses, cycles, generated drift, unowned CSS and inline HTML styles",
  );
  await fs.mkdir("test-results/design-system", { recursive: true });
  await fs.writeFile(
    "test-results/design-system/contract.json",
    JSON.stringify(receipt, null, 2),
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
