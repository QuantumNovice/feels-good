import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledModule } from './load-module.mjs';

const { PlaceSource, withinView, scatterPlaces } = await import(compiledModule('../src/services/places.ts'));
const korea = { south: 32, north: 39, west: 124, east: 132, latitude: 36.5, longitude: 127, zoom: 7 };
const spot = (id, latitude, longitude, category = 'tourism') => ({ id, name: id, source: 'Fixture', category, latitude, longitude });

test('country overview includes distant visible places instead of a 3 km center query', () => {
  assert.ok(withinView(spot('jeju', 33.4, 126.5), korea));
  assert.ok(withinView(spot('busan', 35.2, 129.1), korea));
  assert.equal(withinView(spot('outside', 40, 127), korea), false);
});

test('spatial sampling keeps distant regions when one city is very dense', () => {
  const dense = Array.from({ length: 1000 }, (_, i) => spot(`dense-${i}`, 37.56, 126.98));
  const distant = [spot('jeju', 33.4, 126.5), spot('busan', 35.2, 129.1), spot('ulleungdo', 37.5, 130.8)];
  const result = scatterPlaces([...dense, ...distant], korea);
  assert.equal(result.length, 300);
  for (const p of distant) assert.ok(result.includes(p), p.id);
});

test('overview fetches one category sample, hides expiry, and hydrates original details on selection', async () => {
  const oldFetch = globalThis.fetch, oldDocument = globalThis.document;
  const calls = [];
  const sample = spot('actual-place', 35.2, 129.1);
  const full = { ...sample, address: 'Source address', evidenceUrl: 'https://example.org/place', facilities: { wheelchair: 'yes' } };
  globalThis.document = { baseURI: 'http://127.0.0.1/' };
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, json: async () => String(url).includes('overview-') ? [sample, { ...spot('expired', 37, 127, 'event'), endsAt: '2000-01-01T00:00:00Z' }] : [full] };
  };
  try {
    const source = new PlaceSource();
    assert.deepEqual(await source.query(korea, 'all'), [sample]);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].endsWith('overview-all.json'));
    assert.deepEqual(await source.detail(sample), full);
    assert.ok(calls[1].endsWith('3520-12910.json'));
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.document = oldDocument;
  }
});
