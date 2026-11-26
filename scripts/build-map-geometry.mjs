import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../dist/games/data/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const source = read("border-map.json");
// Match the source's 0.01-degree longitude precision (at most about 1.12km).
// Keep every polygon and hole; simplify only the display outlines, never pins,
// city coordinates, scoring, label anchors, or Borderrot's source geometry.
const tolerance = 0.01;
const latitudeY = (y) =>
  Number(
    ((Math.atan(Math.sinh((y * Math.PI) / 180)) * 180) / Math.PI).toFixed(4),
  );
const distanceSquared = (point, start, end) => {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
              (dx * dx + dy * dy),
          ),
        )
      : 0;
  return (
    (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2
  );
};
function simplify(points) {
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop();
    let furthest = -1,
      distance = tolerance ** 2;
    for (let i = start + 1; i < end; i++) {
      const candidate = distanceSquared(points[i], points[start], points[end]);
      if (candidate > distance) {
        distance = candidate;
        furthest = i;
      }
    }
    if (furthest !== -1) {
      keep.add(furthest);
      pending.push([start, furthest], [furthest, end]);
    }
  }
  const indices = [...keep].sort((a, b) => a - b);
  // Closed rings need three distinct vertices. Preserve tiny islands and holes.
  if (new Set(indices.map((i) => points[i].join(","))).size < 3) return points;
  // Enforce the maximum deviation for every removed vertex.
  for (let i = 1; i < indices.length; i++)
    for (let j = indices[i - 1] + 1; j < indices[i]; j++)
      assert.ok(
        distanceSquared(
          points[j],
          points[indices[i - 1]],
          points[indices[i]],
        ) <=
          tolerance ** 2,
      );
  return indices.map((i) => points[i]);
}
let sourcePoints = 0,
  outputPoints = 0;
const geometry = {
  paths: source.paths.map(([code, path]) => {
    const rings = [...path.matchAll(/M([^MZ]+)Z/g)];
    assert.ok(rings.length && rings.map(([ring]) => ring).join("") === path);
    const converted = rings
      .map(([, ring]) => {
        const points = ring.split("L").map((pair) => {
          const [x, y] = pair.split(",").map(Number);
          assert.ok(Number.isFinite(x) && Number.isFinite(y));
          return [x, latitudeY(y)];
        });
        sourcePoints += points.length;
        // Close explicitly so simplification also respects the final edge.
        if (points[0].join(",") !== points.at(-1).join(","))
          points.push(points[0]);
        const outline = simplify(points);
        outputPoints += outline.length;
        return "M" + outline.map((point) => point.join(",")).join("L") + "Z";
      })
      .join("");
    return [code, converted];
  }),
  anchors: Object.fromEntries(
    Object.entries(source.anchors).map(([code, [x, y]]) => [
      code,
      [x, latitudeY(y)],
    ]),
  ),
  names: read("borderrot.json").map(([code, name]) => [code, name]),
};
assert.equal(geometry.paths.length, source.paths.length);
for (const [code] of geometry.names) assert.ok(geometry.anchors[code]);
const output = JSON.stringify(geometry) + "\n";
writeFileSync(new URL("map-geometry.json", root), output);
console.log(
  `Maprot geometry: ${sourcePoints} → ${outputPoints} vertices; ${Buffer.byteLength(output)} bytes; maximum simplification deviation ${tolerance} degrees.`,
);
