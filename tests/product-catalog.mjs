// Audit the built grocery deck against the frozen official price/size/photo records.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  prepareVisual,
  visualSet,
  visualPuzzle,
} from "../dist/games/visual-puzzles.js";
const read = (path) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const rows = read("../dist/games/data/pricerot.json");
const snapshot = read("../scripts/product-catalog-snapshot.json");
const report = read("../scripts/product-catalog-report.json");
assert.ok(
  rows.length >= 2000,
  `Only ${rows.length} photographed grocery items`,
);
assert.equal(report.playable, rows.length);
assert.equal(snapshot.total, snapshot.items.length);
const originals = new Map(
  snapshot.items.map((product) => [product.sku, product]),
);
assert.equal(originals.size, snapshot.total);
const prepared = prepareVisual("pricerot", rows);
assert.equal(
  prepared.length,
  rows.length,
  "Every published product must have a sourced photo",
);
const skus = new Set(),
  hashes = new Set();
let totalBytes = 0;
const units = {
  Oz: "oz",
  "Weight Ounce": "oz",
  "Fl Oz": "fl oz",
  Lb: "lb",
  Each: "each",
  Doz: "dozen",
  Bag: "bag",
  Pint: "pint",
  Qt: "qt",
};
for (const [index, row] of rows.entries()) {
  const sku = row.sku ?? row.source.split("-").at(-1).split("/").at(-1);
  assert.ok(!skus.has(sku), `${sku}: duplicate product SKU`);
  skus.add(sku);
  if (index >= 12) {
    const original = originals.get(sku);
    assert.ok(original, `${sku}: missing official source record`);
    assert.ok(
      original.categories.some((category) =>
        ["food", "beverages"].includes(category.url_path),
      ),
    );
    assert.equal(row.name, original.item_title.replace(/\s+/g, " ").trim());
    assert.equal(row.cents, Math.round(Number(original.retail_price) * 100));
    assert.ok(row.cents > 0);
    assert.equal(
      row.currency,
      original.price_range.minimum_price.final_price.currency,
    );
    assert.equal(
      row.size,
      `${original.sales_size} ${units[original.sales_uom_description] ?? original.sales_uom_description}`,
    );
    assert.equal(row.captured, snapshot.captured);
    assert.equal(
      row.source,
      `https://www.traderjoes.com/home/products/pdp/${sku}`,
    );
    assert.equal(
      row.imageSource,
      `https://www.traderjoes.com${original.primary_image}`,
    );
  }
  const bytes = fs.readFileSync(
    new URL(`../dist${row.image}`, import.meta.url),
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.ok(!hashes.has(hash), `${sku}: repeated product photo`);
  hashes.add(hash);
  assert.ok(
    row.image.endsWith(`-${hash.slice(0, 12)}.webp`),
    `${sku}: photo filename checksum mismatch`,
  );
  totalBytes += bytes.length;
}
assert.equal(report.imageBytes, totalBytes);
assert.equal(
  [...skus].filter((sku) => originals.has(sku)).length + report.excluded.length,
  snapshot.total,
  "Every source product is included or has an exclusion reason",
);
for (const item of report.excluded)
  assert.ok(!skus.has(item.sku) && item.reason);
for (const date of ["2026-11-17", "2026-11-26"]) {
  assert.equal(
    visualPuzzle(visualSet("pricerot", prepared, date)),
    visualPuzzle(visualSet("pricerot", prepared.slice(0, 12), date)),
    "Preserve issued daily puzzles",
  );
}
const tomorrow = visualSet("pricerot", prepared, "2026-11-27");
assert.ok(
  tomorrow.some((q) => q.item.id.startsWith("tj-")),
  "New daily puzzles use the expanded catalog",
);
console.log(
  `Grocery catalog: ${rows.length} distinct photographed products; every new price, size, SKU and photo source matches its official snapshot.`,
);
