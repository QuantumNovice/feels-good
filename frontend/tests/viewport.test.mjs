import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledModule } from './load-module.mjs';
const { withinView, distance, PlaceSource, isOverview, scatterPlaces } =
  await import(compiledModule('../src/services/places.ts'));
const view = {
  south: 37.2,
  north: 37.4,
  west: 126.9,
  east: 127.1,
  latitude: 37.285,
  longitude: 127.01,
};
test('radius and viewport both restrict records', () => {
  assert.ok(withinView({ latitude: 37.285, longitude: 127.01 }, view));
  assert.equal(withinView({ latitude: 37.38, longitude: 127.01 }, view), false);
  assert.equal(withinView({ latitude: 37.285, longitude: 127.2 }, view), false);
  assert.equal(distance(view, view), 0);
});

test('zoomed-out views include distant visible places and stop at the viewport edge', () => {
  const wide = { ...view, zoom: 12 };
  assert.equal(isOverview(wide), true);
  assert.equal(isOverview({ ...wide, zoom: 13 }), false);
  assert.equal(withinView({ latitude: 37.38, longitude: 127.01 }, wide), true);
  assert.equal(withinView({ latitude: 37.38, longitude: 128 }, wide), false);
});

test('scattered selection keeps sparse corners when a dense cluster exceeds the budget', () => {
  const dense = Array.from({ length: 400 }, (_, i) => ({
    id: String(i),
    category: 'parking',
    latitude: 37.285,
    longitude: 127.01,
  }));
  const corner = {
    id: 'corner',
    category: 'tourism',
    latitude: 37.39,
    longitude: 127.09,
  };
  const result = scatterPlaces([...dense, corner], view);
  assert.equal(result.length, 300);
  assert.ok(result.includes(corner));
  assert.equal(new Set(result.map((p) => p.id)).size, result.length);
});

test('overview reads one bounded sample, excludes expired events and resolves full details on demand', async () => {
  const oldFetch = globalThis.fetch,
    oldDocument = globalThis.document;
  const calls = [];
  const real = {
    id: 'real',
    category: 'tourism',
    layers: ['date'],
    latitude: 37.38,
    longitude: 127.01,
  };
  const expired = {
    ...real,
    id: 'expired',
    category: 'event',
    endsAt: '2020-01-01T00:00:00Z',
  };
  globalThis.document = { baseURI: 'http://127.0.0.1/' };
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () =>
        String(url).includes('overview-')
          ? [real, expired]
          : [
              {
                ...real,
                address: 'Source address',
                evidenceUrl: 'https://example.org/source',
              },
            ],
    };
  };
  try {
    const source = new PlaceSource();
    assert.deepEqual(await source.query({ ...view, zoom: 10 }, 'date'), [real]);
    assert.ok(calls[0].endsWith('overview-date.json'));
    assert.equal(calls.length, 1);
    await source.query({ ...view, zoom: 10 }, 'date');
    assert.equal(calls.length, 1);
    const full = await source.detail(real);
    assert.equal(full.address, 'Source address');
    assert.ok(calls[1].endsWith('3738-12701.json'));
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.document = oldDocument;
  }
});
test('source reads only intersecting cells and limits returned records', async () => {
  const oldFetch = globalThis.fetch,
    oldDocument = globalThis.document;
  const calls = [];
  globalThis.document = { baseURI: 'http://127.0.0.1/' };
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () =>
        String(url).endsWith('index.json')
          ? [
              {
                file: 'near.json',
                south: 37.28,
                north: 37.29,
                west: 127,
                east: 127.02,
              },
              {
                file: 'far.json',
                south: 35,
                north: 35.01,
                west: 129,
                east: 129.01,
              },
            ]
          : Array.from({ length: 400 }, (_, i) => ({
              id: String(i),
              latitude: 37.285,
              longitude: 127.01,
            })),
    };
  };
  try {
    const result = await new PlaceSource().query(view);
    assert.equal(result.length, 300);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].endsWith('near.json'));
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.document = oldDocument;
  }
});

test('a date spot behind 400 closer toilets is filtered before the marker limit', async () => {
  const oldFetch = globalThis.fetch,
    oldDocument = globalThis.document;
  globalThis.document = { baseURI: 'http://127.0.0.1/' };
  const date = {
    id: 'date',
    category: 'tourism',
    layers: ['tourism', 'date'],
    latitude: 37.286,
    longitude: 127.011,
  };
  const points = [
    ...Array.from({ length: 400 }, (_, i) => ({
      id: String(i),
      category: 'bathroom',
      latitude: 37.285,
      longitude: 127.01,
    })),
    date,
  ];
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).endsWith('index.json')
        ? [
            {
              file: 'one.json',
              south: 37.28,
              north: 37.29,
              west: 127,
              east: 127.02,
            },
          ]
        : points,
  });
  try {
    const source = new PlaceSource();
    assert.deepEqual(await source.query(view, 'date'), [date]);
    const all = await source.query(view);
    assert.equal(all.length, 300);
    assert.ok(all.includes(date));
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.document = oldDocument;
  }
});
