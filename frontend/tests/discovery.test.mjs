import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledModule } from './load-module.mjs';
const { matchingTargets, nearestTarget } = await import(
  compiledModule('../src/services/discovery.ts')
);
test('discovery never sends a date-layer search to an expired event and finds the nearest usable area', () => {
  const data = {
    regions: [],
    targets: [
      {
        category: 'date',
        sourceCategory: 'event',
        latitude: 37.5,
        longitude: 127,
        endsAt: '2026-10-01T00:00:00Z',
      },
      {
        category: 'date',
        sourceCategory: 'tourism',
        latitude: 37.51,
        longitude: 127,
      },
      {
        category: 'date',
        sourceCategory: 'date',
        latitude: 35.1,
        longitude: 129,
      },
    ],
  };
  const matches = matchingTargets(
    data,
    'date',
    false,
    Date.parse('2026-10-27T00:00:00Z'),
  );
  assert.equal(matches.length, 2);
  assert.equal(
    nearestTarget(matches, { latitude: 37.5, longitude: 127 }),
    data.targets[1],
  );
  assert.equal(
    nearestTarget([], { latitude: 37.5, longitude: 127 }),
    undefined,
  );
});
