import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { distance } from '@turf/distance';

const read = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), 'utf8'));
// The data pipeline files stay in the private repository; the public source release skips these checks.
const pipeline = existsSync(new URL('../../data/sparse-area-places.json', import.meta.url));
const options = { skip: !pipeline && 'needs the data pipeline files in data/' };
const additions = pipeline ? read('sparse-area-places.json') : [];
const baseline = pipeline ? read('sparse-coverage-baseline.json') : { rows: [] };
const audit = pipeline ? read('sparse-coverage-audit.json') : {};
const regions = new Map(baseline.rows.map((r) => [r.id, r]));
const meters = (a, b) => distance([a.longitude, a.latitude], [b.longitude, b.latitude], { units: 'meters' });

test('every sparse-area addition is a named source record near an underserved region', options, () => {
  assert.ok(additions.length > 0);
  assert.equal(new Set(additions.map((p) => p.id)).size, additions.length);
  for (const p of additions) {
    assert.ok(p.name.trim());
    assert.equal(p.verified, false);
    assert.match(p.evidenceUrl, /^https:\/\/www.openstreetmap.org\/(node|way|relation)\/\d+$/);
    assert.ok(p.coverageTargets.some((id) => regions.get(id)?.total < 10 && meters(p, regions.get(id)) <= 3000.05), p.id);
  }
});

test('coverage improvement examples reconcile to independently measured new places', options, () => {
  assert.equal(audit.before.empty, baseline.rows.filter((r) => r.total === 0).length);
  assert.ok(audit.after.empty < audit.before.empty);
  for (const region of audit.regions.slice(0, 10)) {
    const added = additions.filter((p) => meters(p, region) <= 3000.05).length;
    assert.equal(region.total, regions.get(region.id).total + added);
  }
});

test('the application bundle keeps source-backed sparse features and excludes uncurated restaurants', options, () => {
  const bundle = JSON.parse(readFileSync(new URL('../public/seoul-spots.json', import.meta.url), 'utf8'));
  const ids = new Set(bundle.map((p) => p.id));
  const candidates = new Map(additions.map(p => [p.id, p]));
  assert.ok(bundle.some(p => candidates.has(p.id) && p.placeType === 'peak'));
  for (const p of bundle.filter(p => candidates.has(p.id)))
    assert.ok(p.placeType !== 'restaurant' || p.recommendation, p.id);
  assert.equal(ids.size, bundle.length);
});
