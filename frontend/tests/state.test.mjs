import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(
  readFileSync(new URL('../src/state.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022 } },
).outputText;
const {
  applyLocal,
  selectPlaces,
  mapCandidates,
  PAGE_SIZE,
  MARKER_LIMIT,
  nextOccurrence,
  scheduledToday,
  isAvailable,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
function snapshot() {
  return {
    spots: [
      { id: 'a', category: 'bathroom' },
      { id: 'b', category: 'event', endsAt: '2026-10-26T12:00:00Z' },
    ],
    saved: [],
    notes: {},
    url: '',
    synced: '',
  };
}
test('saving and notes retain the dataset and existing place identities', () => {
  const state = snapshot(),
    spots = state.spots,
    place = spots[0];
  applyLocal(state, 'save', 'a');
  applyLocal(state, 'note', { id: 'a', note: 'Clean' });
  assert.equal(state.spots, spots);
  assert.equal(state.spots[0], place);
  assert.deepEqual(state.saved, ['a']);
  assert.equal(state.notes.a, 'Clean');
  applyLocal(state, 'save', 'a');
  assert.deepEqual(state.saved, []);
});
test('local edit replaces only its place and never duplicates the ID', () => {
  const state = snapshot(),
    untouched = state.spots[1];
  applyLocal(state, 'curate', { id: 'a', category: 'date' });
  assert.equal(state.spots.length, 2);
  assert.equal(state.spots[1], untouched);
  assert.equal(state.spots[0].category, 'date');
});
test('saved/category filters exclude expired and invalid events', () => {
  const state = snapshot();
  assert.deepEqual(
    selectPlaces(
      state.spots,
      new Set(['b']),
      'all',
      true,
      Date.parse('2026-10-26T13:00:00Z'),
    ),
    [],
  );
  assert.equal(
    selectPlaces(state.spots, new Set(), 'bathroom', false).length,
    1,
  );
  assert.equal(
    selectPlaces(
      [{ id: 'x', category: 'event', endsAt: 'invalid' }],
      new Set(),
      'all',
      false,
    ).length,
    0,
  );
});
test('5000 places can be filtered without copying the records; budgets stay bounded', () => {
  const spots = Array.from({ length: 5000 }, (_, i) => ({
    id: String(i),
    category: 'bathroom',
  }));
  const selected = selectPlaces(spots, new Set(['1', '4999']), 'all', true);
  assert.deepEqual(selected, [spots[1], spots[4999]]);
  assert.equal(selected[0], spots[1]);
  assert.equal(PAGE_SIZE, 40);
  assert.equal(MARKER_LIMIT, 300);
});
test('parking appended to a large dataset still appears within the All-map budget', () => {
  const toilets = Array.from({ length: 300 }, (_, i) => ({
    id: `wc-${i}`,
    category: 'bathroom',
  }));
  const parking = Array.from({ length: 19 }, (_, i) => ({
    id: `parking-${i}`,
    category: 'parking',
  }));
  const candidates = Array.from(mapCandidates([...toilets, ...parking])).slice(
    0,
    MARKER_LIMIT,
  );
  assert.equal(candidates.filter((p) => p.category === 'parking').length, 19);
  assert.equal(candidates[0], parking[0]);
});

test('popups expire exactly at exclusive Korean midnight, including saved places', () => {
  const p = { id: 'p', category: 'popup', endsAt: '2026-10-28T00:00:00+09:00' };
  const saved = new Set(['p']),
    end = Date.parse(p.endsAt);
  assert.equal(selectPlaces([p], saved, 'popup', true, end - 1).length, 1);
  assert.equal(selectPlaces([p], saved, 'all', false, end).length, 0);
  assert.equal(selectPlaces([p], saved, 'all', true, end + 1).length, 0);
});
test('missing and malformed popup end dates do not create permanent pins', () => {
  for (const endsAt of [undefined, 'bad-date'])
    assert.equal(
      selectPlaces(
        [{ id: 'p', category: 'popup', endsAt }],
        new Set(),
        'all',
        false,
      ).length,
      0,
    );
});
test('curated date layer reuses tourism records without duplicate places', () => {
  const p = { id: 'park', category: 'tourism', layers: ['tourism', 'date'] };
  assert.deepEqual(selectPlaces([p], new Set(), 'date', false), [p]);
  assert.deepEqual(selectPlaces([p], new Set(), 'tourism', false), [p]);
});

const recurring = JSON.parse(
  readFileSync(
    new URL('../../data/recurring-events.json', import.meta.url),
    'utf8',
  ),
);
test('annual Banpo schedule crosses winter without fabricating winter shows', () => {
  const p = recurring.find((p) => p.id.includes('banpo'));
  const now = Date.parse('2026-11-01T00:00:00+09:00');
  assert.equal(
    new Date(nextOccurrence(p, now).start).toISOString(),
    '2027-04-01T03:00:00.000Z',
  );
  assert.equal(scheduledToday(p, now), false);
  assert.equal(isAvailable(p, now), true); // Catalog survives the closed season.
  assert.equal(
    nextOccurrence(p, Date.parse('2026-10-31T21:19:59+09:00')).end,
    Date.parse('2026-10-31T21:20:00+09:00'),
  );
});
test('weekly drone show uses KST, winter times, exclusions and exclusive ends', () => {
  const p = recurring.find((p) => p.id.includes('gwangalli'));
  assert.equal(
    new Date(
      nextOccurrence(p, Date.parse('2026-10-24T08:00:00+09:00')).start,
    ).toISOString(),
    '2026-10-31T10:00:00.000Z',
  );
  assert.equal(scheduledToday(p, Date.parse('2026-10-30T15:00:00Z')), true); // Saturday in Korea.
  assert.equal(
    nextOccurrence(p, Date.parse('2026-10-31T19:12:00+09:00')).start,
    Date.parse('2026-10-31T21:00:00+09:00'),
  );
  assert.equal(
    nextOccurrence(p, Date.parse('2027-03-06T09:00:00+09:00')).start,
    Date.parse('2027-03-06T20:00:00+09:00'),
  );
});
test('guard ceremony skips Mondays and a bounded schedule stops after its published date', () => {
  const p = recurring.find((p) => p.id.includes('deoksugung'));
  assert.equal(
    nextOccurrence(p, Date.parse('2026-11-02T09:00:00+09:00')).start,
    Date.parse('2026-11-03T11:00:00+09:00'),
  );
  const bounded = {
    ...p,
    recurrence: { ...p.recurrence, validThrough: '2026-12-31' },
  };
  assert.equal(
    isAvailable(bounded, Date.parse('2027-01-01T00:00:00+09:00')),
    false,
  );
});
