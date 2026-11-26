import fs from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFile(new URL(file, root), "utf8");
const tokens = JSON.parse(await read("design/tokens.json"));
const scopes = JSON.parse(await read("design/scopes.json").catch(() => "{}"));
const entries = Object.entries(tokens).flatMap(([group, values]) =>
  Object.entries(values).map(([name, value]) => ({ group, name, value })),
);
const names = new Set(entries.map(({ name }) => name));
const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const references = (text) =>
  [...text.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]);

if (names.size !== entries.length)
  fail("design/tokens.json", "Duplicate token name");
const byName = new Map(entries.map(({ name, value }) => [name, value]));
const componentProperties = new Set([
  "piece",
  "lip",
  "reward-accent",
  "rush-remaining",
  "route-color",
]);
for (const [name, selector] of Object.entries(scopes))
  if (
    !names.has(name) ||
    typeof selector !== "string" ||
    /[{};]/.test(selector)
  )
    fail("design/scopes.json", `Invalid token scope ${name}`);
for (const { name, value } of entries) {
  if (
    !/^[a-z][a-z\d-]*$/.test(name) ||
    typeof value !== "string" ||
    /[;{}]/.test(value)
  )
    fail("design/tokens.json", `Invalid token ${name}`);
  for (const ref of references(value))
    if (!names.has(ref) && !componentProperties.has(ref))
      fail("design/tokens.json", `${name} references unknown token ${ref}`);
    else if (componentProperties.has(ref) && !scopes[name])
      fail("design/tokens.json", `${name} must resolve in a component scope`);
}
function visit(name, ancestors = new Set()) {
  if (ancestors.has(name)) {
    fail(
      "design/tokens.json",
      `Cyclic token reference: ${[...ancestors, name].join(" → ")}`,
    );
    return;
  }
  for (const ref of references(byName.get(name) ?? ""))
    if (names.has(ref)) visit(ref, new Set([...ancestors, name]));
}
for (const name of names) visit(name);

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

const output = new Map();
const themeColor = tokens.color["color-canvas"];
if (!/^#[\da-f]{6}$/i.test(themeColor))
  fail("design/tokens.json", "Canvas colour must support browser theme-color");
const tokenCSS = `/* Generated from design/tokens.json. Run bun run design:build. */\n:root {\n${entries
  .filter(({ name }) => !scopes[name])
  .map(({ name, value }) => `  --${name}: ${value};`)
  .join(
    "\n",
  )}\n  color-scheme: dark;\n  font-family: var(--font-sans);\n  font-size: var(--font-size-13);\n  font-weight: var(--font-weight-regular);\n  color: var(--ink);\n  background: var(--paper);\n}\n${Object.entries(
  scopes,
)
  .map(
    ([name, selector]) => `${selector} { --${name}: ${byName.get(name)}; }\n`,
  )
  .join("")}`;
output.set("dist/design-system.css", tokenCSS);
output.set(
  "src/design-token-names.ts",
  `// Generated from design/tokens.json. Run bun run design:build.\nexport type DesignToken =\n${entries.map(({ name }) => `  | "--${name}"`).join("\n")};\n`,
);

const sheets = await files("design/styles", ".css");
for (const file of sheets) {
  const css = await read(file);
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/:root\s*\{/.test(clean))
    fail(file, "Root design values belong in design/tokens.json");
  // Absolute dimensions and viewport measures must be named. Percentages,
  // fractions, zero and game coordinates remain relative to their local layout.
  if (/(?<![\w-])(?:\d*\.)?\d+(?:px|rem|em|ms|s|vw|vh|dvh)\b/i.test(clean))
    fail(file, "Use named tokens for dimensions and durations");
  for (const ref of references(clean))
    if (!names.has(ref) && !componentProperties.has(ref))
      fail(file, `Unknown token --${ref}`);
  for (const match of clean.matchAll(/([\w-]+)\s*:([^;{}]+)(?=[;}])/g)) {
    const [, property, value] = match;
    if (
      /(?:#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lch|lab|hwb|color(?:-mix)?|(?:repeating-)?(?:linear|radial|conic)-gradient)\s*\()/i.test(
        value.replace(/var\([^)]*\)/g, ""),
      )
    )
      fail(file, `Use a colour token for ${property}`);
    if (
      /^(font-size|font-family|font-weight|line-height|letter-spacing)$/.test(
        property,
      ) &&
      !/^(?:\s*(?:var\(--[\w-]+\)|inherit|normal|0)\s*)$/.test(value)
    )
      fail(file, `Use a typography token for ${property}`);
    if (property === "font" && value.trim() !== "inherit")
      fail(file, "Use individual typography tokens or font: inherit");
    if (
      property === "box-shadow" &&
      !/^\s*(?:var\(--[\w-]+\)|none|inherit)\s*$/.test(value)
    )
      fail(file, "Use a named shadow recipe");
    if (
      property === "border-radius" &&
      /\d/.test(value.replace(/var\([^)]+\)/g, "").replace(/\b0\b/g, ""))
    )
      fail(file, "Use radius tokens");
    if (
      /^(?:padding|margin|gap|row-gap|column-gap)(?:-.+)?$/.test(property) &&
      /\d/.test(
        value
          .replace(/var\([^)]+\)/g, "")
          .replace(/\b0\b/g, "")
          .replace(/\*\s*-1/g, ""),
      )
    )
      fail(file, `Use the spacing scale for ${property}`);
    if (
      /^(?:opacity|z-index|stroke-width|stroke-opacity|filter)$/.test(
        property,
      ) &&
      !/^\s*(?:var\(--[\w-]+\)|0|1|none|auto|inherit)\s*$/.test(value)
    )
      fail(file, `Use a named token for ${property}`);
    if (
      property.startsWith("--") &&
      !componentProperties.has(property.slice(2)) &&
      !(
        file.endsWith("playroom.css") &&
        ["--paper", "--panel"].includes(property)
      )
    )
      fail(
        file,
        `Custom property ${property} must be declared in design/tokens.json`,
      );
    if (
      /^(?:color|background(?:-color)?|fill|stroke|.*-color)$/.test(property) &&
      /\b(?:white|black|red|blue|green|yellow|orange|purple|gray|grey|navy)\b/.test(
        value.replace(/var\([^)]*\)/g, ""),
      )
    )
      fail(file, `Use a colour token for ${property}`);
  }
  const compiled = css.replace(/breakpoint\(([\w-]+)\)/g, (_, name) => {
    const value = tokens.breakpoint[`breakpoint-${name}`];
    if (!value) fail(file, `Unknown breakpoint ${name}`);
    return value ?? "0px";
  });
  output.set(
    file.replace("design/styles/", "dist/"),
    `/* Generated from ${file}. Run bun run design:build. */\n${compiled}`,
  );
}

// Literal design colours in renderers bypass CSS tokens just as CSS literals do.
for (const file of await files("src", ".ts")) {
  if (file === "src/design-token-names.ts") continue;
  const source = await read(file);
  if (/["'`]#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?["'`]/i.test(source))
    fail(file, "Read paint colours through designValue(), or use CSS classes");
  for (const match of source.matchAll(/designValue\(["']--([\w-]+)["']/g))
    if (!names.has(match[1])) fail(file, `Unknown design token --${match[1]}`);
  for (const match of source.matchAll(
    /(?:\.style(?:\.[\w]+|\[["'][\w-]+["']\])|\.(?:fillStyle|strokeStyle))\s*=\s*["']([^"']*)["']/g,
  ))
    if (
      /#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(|\d+(?:px|rem|em|ms)\b/i.test(match[1])
    )
      fail(file, "Use CSS classes or designValue() for literal inline styles");
  for (const match of source.matchAll(
    /\.style\.setProperty\(["']([^"']+)["']/g,
  ))
    if (
      !names.has(match[1].replace(/^--/, "")) &&
      !componentProperties.has(match[1].replace(/^--/, ""))
    )
      fail(file, `Unregistered runtime style property ${match[1]}`);
}

// Each stylesheet has an authored owner; adding an ad-hoc dist stylesheet fails.
for (const file of await files("dist", ".css"))
  if (!output.has(file)) fail(file, "Stylesheet has no owner in design/styles");

for (const file of await files("dist", ".html")) {
  const html = await read(file);
  if (/<style\b|\sstyle\s*=/i.test(html))
    fail(file, "Author styles in design/styles, not HTML");
  // Some generated source pages omit an explicit <head>. Inserting before the
  // first stylesheet works for those pages and normal documents alike.
  const withoutTokens = html.replace(
    /<link[^>]+href=["']\/design-system\.css["'][^>]*>\s*/g,
    "",
  );
  const linked = withoutTokens
    .replace(
      /<link\b(?=[^>]*rel=["']stylesheet["'])/,
      '<link rel="stylesheet" href="/design-system.css">\n  <link',
    )
    .replace(
      /(<meta name="theme-color" content=")[^"]*(">)/g,
      `$1${themeColor}$2`,
    );
  if (!linked.includes('href="/design-system.css"'))
    fail(file, "Page has no stylesheet entry point");
  output.set(file, linked);
}

const check = process.argv.includes("--check");
if (!errors.length) {
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
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Design system: ${entries.length} tokens, ${sheets.length} stylesheets; ${check ? "checked" : "built"}.`,
  );
}
