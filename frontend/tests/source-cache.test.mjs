import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledModule } from './load-module.mjs';
const { RemoteSource, SOURCE_REFRESH_MS } = await import(
  compiledModule('../src/services/remoteSource.ts')
);
const records = [
  {
    id: 'place',
    name: 'Place',
    category: 'tourism',
    latitude: 37.5,
    longitude: 127,
    source: 'Test fixture',
  },
];
function storage(initial) {
  let value = initial;
  return {
    read: async () => value,
    write: async (data) => {
      value = data;
    },
    clear: async () => {
      value = undefined;
    },
    value: () => value,
  };
}
function body(data = records, headers = { ETag: '"v1"' }) {
  return new Response(JSON.stringify(data), { status: 200, headers });
}
test('validated source is persisted and restored offline', async () => {
  const store = storage(),
    remote = new RemoteSource(
      store,
      async () => body(),
      () => 1000,
    );
  await remote.refresh('https://example.org/places.json');
  const restored = new RemoteSource(store, async () => {
    throw Error('offline');
  });
  await restored.restore();
  await assert.rejects(restored.refresh(restored.current.url));
  assert.deepEqual(restored.current.spots, records);
  assert.equal(store.value().url, 'https://example.org/places.json');
});
test('conditional 304 refresh retains records and updates the check timestamp', async () => {
  const store = storage();
  let now = 1000,
    calls = 0,
    etag;
  const remote = new RemoteSource(
    store,
    async (_, options) => {
      calls++;
      etag = options.headers['If-None-Match'];
      return calls === 1 ? body() : new Response(null, { status: 304 });
    },
    () => now,
  );
  await remote.refresh('https://example.org/places.json');
  const previous = remote.current.spots;
  now += 100;
  await remote.refresh(remote.current.url);
  assert.equal(etag, '"v1"');
  assert.equal(remote.current.spots, previous);
  assert.equal(remote.current.checkedAt, now);
});
test('periodic refresh respects the 15 minute interval', async () => {
  let now = 1000,
    calls = 0;
  const remote = new RemoteSource(
    storage(),
    async () => {
      calls++;
      return body();
    },
    () => now,
  );
  await remote.refresh('https://example.org/places.json');
  now += SOURCE_REFRESH_MS - 1;
  await remote.refresh(remote.current.url, false);
  assert.equal(calls, 1);
  now++;
  await remote.refresh(remote.current.url, false);
  assert.equal(calls, 2);
});
test('invalid JSON, duplicate IDs and HTTP errors preserve the last valid cache', async () => {
  for (const failure of [
    () => new Response('{broken'),
    () => body([...records, ...records]),
    () => new Response('bad', { status: 503 }),
  ]) {
    let fail = false;
    const store = storage();
    const remote = new RemoteSource(store, async () =>
      fail ? failure() : body(),
    );
    await remote.refresh('https://example.org/places.json');
    const before = store.value();
    fail = true;
    await assert.rejects(remote.refresh(remote.current.url));
    assert.equal(store.value(), before);
    assert.equal(remote.current, before);
  }
});
test('oversized bodies are rejected before cache replacement', async () => {
  const remote = new RemoteSource(
    storage(),
    async () => new Response('x'.repeat(2_000_001)),
  );
  await assert.rejects(
    remote.refresh('https://example.org/places.json'),
    /source_too_large/,
  );
  assert.equal(remote.current, undefined);
});
test('concurrent requests for the same source share one fetch', async () => {
  let calls = 0,
    release;
  const gate = new Promise((resolve) => (release = resolve));
  const remote = new RemoteSource(storage(), async () => {
    calls++;
    await gate;
    return body();
  });
  const first = remote.refresh('https://example.org/places.json'),
    second = remote.refresh('https://example.org/places.json');
  assert.equal(first, second);
  release();
  await first;
  assert.equal(calls, 1);
});
test('reset cancels stale requests and clears only the remote source', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve)),
    store = storage();
  const remote = new RemoteSource(store, async () => {
    await gate;
    return body();
  });
  const pending = remote.refresh('https://example.org/places.json');
  await remote.reset();
  release();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(store.value(), undefined);
});
