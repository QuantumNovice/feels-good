import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { bbox } from '@turf/bbox';
const source = 'https://download.geofabrik.de/asia/south-korea.poly';
let text;
if (process.argv[2]) {
  text = await readFile(process.argv[2], 'utf8');
} else {
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error('Could not fetch the Korea extract outline');
  text = await response.text();
}
if (text.length > 100_000) throw Error('Unexpected outline size');
const polygons = [];
let ring, hole = false;
for (const raw of text.split(/\r?\n/).slice(1)) {
  const line = raw.trim();
  if (!line) continue;
  if (line === 'END') {
    if (ring?.length) {
      if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) ring.push(ring[0]);
      if (ring.length < 4) throw Error('Invalid polygon ring');
      if (hole) polygons.at(-1).push(ring);
      else polygons.push([ring]);
      ring = undefined;
    }
    continue;
  }
  if (!ring) { hole = line.startsWith('!'); ring = []; continue; }
  const point = line.split(/\s+/).map(Number);
  if (point.length !== 2 || !point.every(Number.isFinite)) throw Error('Invalid outline coordinate');
  ring.push(point);
}
const feature = {
  type: 'Feature', properties: {
    source, provider: 'Geofabrik / OpenStreetMap', checkedAt: new Date().toISOString(),
    scope: 'Data extract coverage outline, not a legal or administrative boundary',
  }, geometry: { type: 'MultiPolygon', coordinates: polygons },
};
feature.bbox = bbox(feature);
if (!polygons.length) throw Error('Empty Korea coverage outline');
const json = JSON.stringify(feature);
await mkdir(new URL('../src/assets/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/assets/korea-coverage.json', import.meta.url), json);
await writeFile(new URL('../../data/korea-coverage.geojson', import.meta.url), json);
console.log(JSON.stringify({ polygons: polygons.length, bounds: feature.bbox, bytes: json.length }));
