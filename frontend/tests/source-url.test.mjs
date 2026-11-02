import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledModule } from './load-module.mjs';
const { normalizeSourceUrl } = await import(
  compiledModule('../src/services/sourceUrl.ts')
);
test('GitHub file pages resolve to raw JSON', () => {
  assert.equal(
    normalizeSourceUrl('https://github.com/alice/places/blob/main/spots.json'),
    'https://raw.githubusercontent.com/alice/places/main/spots.json',
  );
});
test('GitHub repository URLs use its default branch and a chosen JSON path', () => {
  assert.equal(
    normalizeSourceUrl(
      'https://github.com/alice/places',
      'data/local spots.json',
    ),
    'https://api.github.com/repos/alice/places/contents/data/local%20spots.json',
  );
});
test('direct JSON URLs retain query data and omit fragments', () => {
  assert.equal(
    normalizeSourceUrl('https://example.org/places.json?region=busan#top'),
    'https://example.org/places.json?region=busan',
  );
});
test('invalid source schemes, embedded credentials and traversal are rejected', () => {
  for (const url of [
    'http://example.org/a.json',
    'javascript:alert(1)',
    'https://user:secret@example.org/a.json',
    'https://github.com/alice',
  ])
    assert.throws(() => normalizeSourceUrl(url));
  assert.throws(() =>
    normalizeSourceUrl('https://github.com/alice/places', '../secret.json'),
  );
});
