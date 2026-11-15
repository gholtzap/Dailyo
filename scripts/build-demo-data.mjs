import { mkdirSync, writeFileSync } from 'node:fs';
import { createRouter } from '../dist/router.js';

const output = new URL('../dist/data/', import.meta.url);
const districts = [
  ['Northbank', 40.805, ['Orchard Gate', 'Alder Street', 'Hilltop', 'Glassworks', 'Cedar Square', 'Mill Lane', 'North Pier']],
  ['Crosswater', 40.755, ['Beacon Point', 'West Quay', 'Market Hall', 'Canal Bridge', 'Bell Tower', 'East Dock', 'Seabright']],
  ['Southbank', 40.705, ['Windward', 'Fern Street', 'Foundry', 'Salt Gardens', 'Cove Square', 'Marina Walk', 'Lighthouse']],
];
const stationRows = districts.map(([area, lat, names], row) => names.map((name, column) => ({
  id: `demo-${row + 1}-${column + 1}`,
  name,
  label: name,
  area,
  lat,
  lon: -74.045 + column * 0.024,
})));
const [north, central, south] = stationRows;
const stops = stationRows.flat();
const stations = Object.fromEntries(stops.map(station => [station.id, station]));
const lines = [
  ['1', 'e4424c', north, 180],
  ['2', 'ac2d6e', north, 205],
  ['A', '437edc', central, 180],
  ['C', '247bb1', central, 205],
  ['7', '9a4ebd', south, 180],
  ['G', '4a9e63', south, 205],
  ['N', 'edc536', stationRows.map(row => row[2]), 225],
  ['F', 'e58e35', stationRows.map(row => row[4]), 225],
];
const routes = Object.fromEntries(lines.map(([id, color]) => [id, { id, name: id, color }]));
const patterns = lines.flatMap(([route, , line, duration]) => [line, [...line].reverse()].map(stops => ({
  route,
  headsign: stops.at(-1).label,
  stations: stops.map(stop => stop.id),
  seconds: stops.slice(1).map(() => duration),
  offsets: stops.map((_, index) => index),
  geometry: stops.map(({ lon, lat }) => [lon, lat]),
})));
const network = {
  metadata: {
    feedVersion: 'dailyo-demo-v1',
    mapName: 'Harbour City',
    transferSeconds: 240,
    model: 'Fictional stations, geometry, and travel times.',
  },
  stations,
  routes,
  patterns,
};

const router = createRouter(network);
const difficulties = ['easy', 'medium', 'hard'];
const challenges = stops.flatMap(from => stops.flatMap(to => {
  if (from === to) return [];
  const best = router.best(from.id, to.id);
  const stops = best.legs.reduce((total, leg) => total + leg.stops, 0);
  if (stops < 4 || best.seconds < 720 || best.seconds > 2100 || best.legs.length > 3) return [];
  return [{
    from: from.id, to: to.id,
    fromTitle: from.label, toTitle: to.label,
    fromArea: from.area, toArea: to.area,
    difficulty: difficulties[best.legs.length - 1],
  }];
}));

const boroughs = {
  type: 'FeatureCollection',
  features: [
    [[-74.095, 40.832], [-73.966, 40.841], [-73.967, 40.787], [-73.987, 40.776],
      [-73.988, 40.737], [-73.965, 40.721], [-73.966, 40.669], [-74.084, 40.678],
      [-74.11, 40.727], [-74.118, 40.785], [-74.095, 40.832]],
    [[-73.951, 40.839], [-73.864, 40.831], [-73.84, 40.783], [-73.842, 40.706],
      [-73.865, 40.677], [-73.954, 40.675], [-73.951, 40.724], [-73.965, 40.741],
      [-73.968, 40.773], [-73.952, 40.788], [-73.951, 40.839]],
  ].map(ring => ({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[ring]] } })),
};

mkdirSync(output, { recursive: true });
for (const [name, data] of Object.entries({ network, boroughs, challenges })) {
  writeFileSync(new URL(`${name}.json`, output), JSON.stringify(data) + '\n');
}
console.log(`Generated ${challenges.length} Harbour City subway puzzles.`);
