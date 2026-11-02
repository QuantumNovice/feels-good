import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledModule } from './load-module.mjs';
const { persistPersonalChange } = await import(
  compiledModule('../src/services/personalPlaces.ts')
);

const place = {
  id: 'local:persistent',
  name: 'Meeting point',
  category: 'tourism',
  latitude: 37.5665,
  longitude: 126.978,
  source: 'Personal curation',
};
const snapshot = () => ({
  spots: [],
  saved: ['other'],
  notes: { other: 'Keep this' },
  url: 'https://example.org/feed.json',
  synced: '2026-10-31',
});

test('a personal place and its edit survive storage round trips independently of remote records', () => {
  let raw;
  const storage = {
    setItem: (key, value) => {
      assert.equal(key, 'preview');
      raw = value;
    },
  };
  const state = snapshot();
  state.spots = [{ ...place, id: 'remote', source: 'Provider' }];
  persistPersonalChange(storage, state, [], 'curate', place);
  const reopened = JSON.parse(raw);
  assert.deepEqual(reopened.spots, [place]);
  assert.deepEqual(reopened.saved, state.saved);
  assert.deepEqual(reopened.notes, state.notes);
  assert.equal(reopened.url, '');
  persistPersonalChange(storage, reopened, reopened.spots, 'curate', {
    ...place,
    name: 'Updated meeting point',
  });
  const edited = JSON.parse(raw);
  assert.equal(edited.spots.length, 1);
  assert.equal(edited.spots[0].name, 'Updated meeting point');
  assert.equal(state.spots[0].id, 'remote');
});

test('failed browser writes leave the live state and earlier personal data unchanged', () => {
  const state = snapshot();
  const oldPlace = { ...place, name: 'Original' };
  const before = structuredClone(state);
  const storage = {
    setItem: () => {
      throw new DOMException('Full', 'QuotaExceededError');
    },
  };
  assert.throws(
    () => persistPersonalChange(storage, state, [oldPlace], 'curate', place),
    { name: 'QuotaExceededError' },
  );
  assert.deepEqual(state, before);
  assert.equal(oldPlace.name, 'Original');
});

test('saving and notes preserve all previously added places', () => {
  let raw;
  const storage = {
    setItem: (_, value) => {
      raw = value;
    },
  };
  const state = { ...snapshot(), spots: [place] };
  persistPersonalChange(storage, state, [place], 'save', place.id);
  const saved = JSON.parse(raw);
  persistPersonalChange(storage, saved, saved.spots, 'note', {
    id: place.id,
    note: 'Meet by the entrance',
  });
  const reopened = JSON.parse(raw);
  assert.deepEqual(reopened.spots, [place]);
  assert.ok(reopened.saved.includes(place.id));
  assert.equal(reopened.notes[place.id], 'Meet by the entrance');
  assert.equal(reopened.notes.other, 'Keep this');
});
