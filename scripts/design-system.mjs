import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import selectorParser from "postcss-selector-parser";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFile(new URL(file, root), "utf8");
const check = process.argv.includes("--check");
const tokens = JSON.parse(await read("design/tokens.json"));
const entries = Object.values(tokens).flatMap(Object.entries);
const publicNames = new Set(entries.map(([name]) => `--${name}`));
const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const owners = ["components", "games", "subway", "feed"];
const runtimeProperties = new Set(["--route-color", "--rush-remaining"]);

const cosmetics =
  /^(?:color|background(?:-.+)?|border(?:-.+)?|box-shadow|font(?:-.+)?|letter-spacing|line-height|filter|outline(?:-.+)?|opacity)$/;
const componentNames = {
  primary: "button",
  "primary-button": "button",
  secondary: "button",
  "secondary-button": "button",
  choice: "answer",
  "swap-tile": "answer",
  main: "board",
  prompt: "question",
  "site-masthead": "nav",
  "site-modes": "nav",
  "site-more-links": "nav",
  "game-help-dialog": "dialog",
  "rot-map-dialog": "dialog",
  "screen-reader-only": "screen-reader",
};

function references(value) {
  const names = [];
  valueParser(value).walk((node) => {
    if (node.type === "function" && node.value === "var")
      names.push(node.nodes[0]?.value);
  });
  return names;
}
async function files(directory, extension) {
  const result = [];
  for (const entry of await fs.readdir(new URL(directory, root), {
    withFileTypes: true,
  })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await files(file, extension)));
    else if (file.endsWith(extension)) result.push(file);
  }
  return result.sort();
}
function classes(selector) {
  const names = [];
  selectorParser((ast) =>
    ast.walkClasses((node) => names.push(node.value)),
  ).processSync(selector);
  return names;
}
function targets(selector, kind = "class") {
  const names = [];
  const collect = (list) => {
    for (const branch of list.nodes)
      for (const node of [...branch.nodes].reverse()) {
        if (node.type === "combinator") break;
        if (node.type === kind) names.push(node.value);
        if (node.type === "pseudo" && [":is", ":where"].includes(node.value))
          collect(node);
      }
  };
  selectorParser(collect).processSync(selector);
  return names;
}
function ownsProperty(rule, property) {
  if (property === "--paper" && rule.selector.includes("[data-daily-feed]"))
    return true;
  const names = classes(rule.selector);
  selectorParser((ast) =>
    ast.walkIds((node) => names.push(node.value)),
  ).processSync(rule.selector);
  const prefixes = [
    ...names,
    ...names.map((name) => componentNames[name]).filter(Boolean),
  ];
  // Tag-based controls have no class; their private values still belong to the system.
  if (/\b(?:input|select|textarea|button|svg)\b/.test(rule.selector))
    prefixes.push("field", "control");
  if (names.includes("planner")) prefixes.push("reward");
  return prefixes.some((prefix) => property.startsWith(`--${prefix}-`));
}
function validateValue(decl, file) {
  if (decl.prop.startsWith("--")) return;
  valueParser(decl.value).walk((node) => {
    if (node.type === "function" && node.value === "url") return false;
    if (
      node.type === "function" &&
      /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|.*gradient)$/.test(
        node.value,
      )
    )
      fail(
        file,
        `${decl.prop}: colour recipes belong in named component properties`,
      );
    if (node.type !== "word") return;
    if (node.value.startsWith("#"))
      fail(file, `${decl.prop}: use a colour token`);
    const measure = valueParser.unit(node.value);
    if (
      measure?.unit &&
      !["%", "fr", "deg", "ch", "ex"].includes(measure.unit) &&
      !(
        Number(measure.number) === 100 &&
        ["vw", "vh", "dvh"].includes(measure.unit)
      ) &&
      Number(measure.number) !== 0
    )
      fail(file, `${decl.prop}: name fixed measures at their component owner`);
    if (
      /^(?:color|background-color|border(?:-.+)?-color|fill|stroke)$/.test(
        decl.prop,
      ) &&
      !node.value.startsWith("--") &&
      ![
        "none",
        "transparent",
        "currentColor",
        "inherit",
        "initial",
        "unset",
      ].includes(node.value)
    )
      fail(file, `${decl.prop}: use a colour token`);
    if (
      /^(?:(?:padding|margin)(?:-.+)?|gap|row-gap|column-gap|border-radius)$/.test(
        decl.prop,
      ) &&
      measure &&
      !["0", "1", "-1"].includes(node.value)
    )
      fail(
        file,
        `${decl.prop}: use the shared scale or a named component property`,
      );
    if (
      /^(?:background|border|outline)$/.test(decl.prop) &&
      /^(?:white|black|red|blue|green|yellow|orange|purple|gray|grey|navy|rebeccapurple)$/.test(
        node.value,
      )
    )
      fail(file, `${decl.prop}: use a colour token`);
    if (
      /^(?:font-size|font-family|font-weight|line-height|letter-spacing|opacity|z-index)$/.test(
        decl.prop,
      ) &&
      measure &&
      !measure.unit &&
      !["0", "1"].includes(node.value)
    )
      fail(file, `${decl.prop}: use a shared token`);
  });
  if (
    /^(?:font-family|font-size|font-weight|line-height|letter-spacing)$/.test(
      decl.prop,
    ) &&
    !references(decl.value).length &&
    !["inherit", "normal", "0"].includes(decl.value)
  )
    fail(file, `${decl.prop}: use the shared type scale`);
  if (decl.prop === "font" && decl.value !== "inherit")
    fail(file, "Use individual type tokens");
}

if (publicNames.size !== entries.length)
  fail("design/tokens.json", "Duplicate token name");
for (const [name, value] of entries) {
  if (/^(?:size-\d|compat-)/.test(name))
    fail("design/tokens.json", `${name}: name the decision, not its old value`);
  if (typeof value !== "string" || /[;{}]/.test(value))
    fail("design/tokens.json", `Invalid token ${name}`);
}
for (const [name, value] of entries)
  for (const ref of references(value))
    if (!publicNames.has(ref))
      fail(
        "design/tokens.json",
        `${name}: public tokens may only reference other public tokens`,
      );
const sheets = new Map();
const definitions = new Set(publicNames);
const dependencies = new Map(
  entries.map(([name, value]) => [`--${name}`, new Set(references(value))]),
);
for (const name of owners) {
  const file = `design/styles/${name}.css`;
  try {
    const css = postcss.parse(await read(file), { from: file });
    css.walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) return;
      if (decl.parent.type !== "rule" || !ownsProperty(decl.parent, decl.prop))
        fail(
          file,
          `${decl.prop}: declare private values on their named component`,
        );
      if (publicNames.has(decl.prop) && decl.prop !== "--paper")
        fail(file, `${decl.prop}: shared values belong in tokens.json`);
      definitions.add(decl.prop);
      if (!dependencies.has(decl.prop)) dependencies.set(decl.prop, new Set());
      references(decl.value).forEach((ref) =>
        dependencies.get(decl.prop).add(ref),
      );
    });
    sheets.set(file, css);
  } catch (error) {
    fail(file, error.message);
  }
}
for (const file of await files("design/styles", ".css"))
  if (!sheets.has(file))
    fail(
      file,
      "Use the existing component or game owner instead of a feature-local stylesheet",
    );
const controls = new Set();
const sharedRules = sheets.get("design/styles/components.css");
sharedRules?.walkRules((rule) => {
  if (
    rule.nodes.some(
      (node) =>
        node.type === "decl" &&
        /^(?:color|background(?:-.+)?|border(?:-.+)?|box-shadow|font(?:-.+)?)$/.test(
          node.prop,
        ),
    )
  )
    targets(rule.selector).forEach((name) => controls.add(name));
});
const states = new Set([
  "correct",
  "wrong",
  "active",
  "current",
  "incorrect",
  "selected",
  "disabled",
]);
sharedRules?.walkRules((rule) => {
  if (rule.selector.includes(":is(") || rule.selector.includes(":where("))
    return;
  const names = targets(rule.selector);
  if (names.some((name) => controls.has(name)))
    names
      .filter((name) => !states.has(name))
      .forEach((name) => controls.add(name));
});
for (const name of states) controls.delete(name);
for (const [file, css] of sheets) {
  css.walkRules((rule) => {
    if (rule.selector === ":root")
      fail(file, "Root values belong in tokens.json");
    if (
      !file.endsWith("components.css") &&
      (targets(rule.selector).some((name) => controls.has(name)) ||
        targets(rule.selector, "tag").some((name) =>
          ["button", "input", "select", "textarea"].includes(name),
        ))
    )
      for (const decl of rule.nodes.filter((node) => node.type === "decl"))
        if (cosmetics.test(decl.prop))
          fail(
            file,
            `${rule.selector}: shared control appearance belongs in components.css`,
          );
  });
  css.walkDecls((decl) => {
    for (const ref of references(decl.value))
      if (!definitions.has(ref) && !runtimeProperties.has(ref))
        fail(file, `${decl.prop}: unknown token ${ref}`);
    validateValue(decl, file);
  });
  css.walkAtRules("media", (rule) => {
    const value = valueParser(rule.params);
    value.walk((node) => {
      if (node.type !== "function" || node.value !== "breakpoint") return;
      const name = `breakpoint-${node.nodes[0]?.value}`;
      if (!tokens.breakpoint[name]) fail(file, `Unknown breakpoint ${name}`);
      node.type = "word";
      node.value = tokens.breakpoint[name] ?? "0px";
      delete node.nodes;
    });
    rule.params = value.toString();
  });
}
function visit(name, trail = new Set()) {
  if (trail.has(name)) {
    fail("design", `Cyclic token reference ${[...trail, name].join(" → ")}`);
    return;
  }
  for (const ref of dependencies.get(name) ?? [])
    visit(ref, new Set([...trail, name]));
}
for (const name of dependencies.keys()) visit(name);
for (const file of await files("src", ".ts")) {
  if (file.includes("design-token-names")) continue;
  const source = await read(file);
  if (/\.(?:fillStyle|strokeStyle)\s*=\s*["'`]/.test(source))
    fail(
      file,
      "Resolve canvas paint through designValue(), rather than a literal",
    );
  for (const match of source.matchAll(
    /\.style\.(?:color|backgroundColor|borderColor|fontFamily|fontSize|fontWeight|lineHeight|letterSpacing|boxShadow|opacity|zIndex)\s*=\s*["']([^"']*)["']/g,
  ))
    if (
      !references(match[1]).length &&
      !["", "0", "1", "none", "auto", "inherit", "transparent"].includes(
        match[1],
      )
    )
      fail(file, "Inline appearance belongs at the component's CSS owner");
  if (/["'`]#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?["'`]/i.test(source))
    fail(file, "Canvas paints must use designValue()");
  for (const match of source.matchAll(
    /\.style\.setProperty\(["']([^"']+)["']/g,
  ))
    if (!runtimeProperties.has(match[1]))
      fail(file, `Unregistered data-driven property ${match[1]}`);
  for (const match of source.matchAll(/\.style\.[\w]+\s*=\s*["']([^"']+)["']/g))
    if (/\d+(?:px|rem|em|ms)\b|#[\da-f]+/i.test(match[1]))
      fail(file, "Inline design values belong in component CSS");
}

const output = new Map();
const themeColor = tokens.color.paper;
if (!/^#[\da-f]{6}$/i.test(themeColor))
  fail(
    "design/tokens.json",
    "paper must be a hex colour for browser theme metadata",
  );
output.set(
  "dist/design-system.css",
  `/* Generated from design/tokens.json. */\n:root {\n${entries.map(([name, value]) => `  --${name}: ${value};`).join("\n")}\n  color-scheme: dark;\n  font-family: var(--font-sans);\n  font-size: var(--font-size-13);\n  font-weight: var(--font-weight-regular);\n  color: var(--ink);\n  background: var(--paper);\n}\n`,
);
for (const [file, css] of sheets)
  output.set(
    file.replace("design/styles/", "dist/"),
    `/* Generated from ${file}. */\n${css.toString()}`,
  );
output.set(
  "src/design-token-names.d.ts",
  `// Generated from design/tokens.json.\nexport type DesignToken =\n${[...publicNames].map((name) => `  | "${name}"`).join("\n")};\n`,
);
for (const file of await files("dist", ".html")) {
  const html = await read(file);
  if (/<style\b|\sstyle\s*=/i.test(html))
    fail(file, "Inline HTML styles bypass the design system");
  const family = /data-game=/.test(html)
    ? "games"
    : /class="[^"]*daily-feed/.test(html)
      ? "feed"
      : "subway";
  const links = ["design-system", family, "components"]
    .map((name) => `<link rel="stylesheet" href="/${name}.css">`)
    .join("\n  ");
  let inserted = false;
  const linked = html
    .replace(/<link\b(?=[^>]*rel=["']stylesheet["'])[^>]*>\s*/g, () => {
      if (inserted) return "";
      inserted = true;
      return links + "\n";
    })
    .replace(
      /(<meta name="theme-color" content=")[^"]*(">)/g,
      `$1${themeColor}$2`,
    );
  if (!inserted) fail(file, "Missing stylesheet entry point");
  output.set(file, linked);
}
for (const file of await files("dist", ".css"))
  if (!output.has(file)) fail(file, "Unowned stylesheet");
if (!errors.length)
  for (const [file, content] of output) {
    if (check) {
      if ((await read(file).catch(() => null)) !== content)
        fail(
          file,
          "Generated design output is stale; run bun run design:build",
        );
    } else {
      await fs.mkdir(new URL(path.dirname(file) + "/", root), {
        recursive: true,
      });
      await fs.writeFile(new URL(file, root), content);
    }
  }
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Design system: ${entries.length} shared tokens, ${sheets.size} authored stylesheets; ${check ? "checked" : "built"}.`,
  );
