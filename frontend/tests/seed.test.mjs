import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
const coverage = JSON.parse(
  readFileSync(new URL('../src/assets/korea-coverage.json', import.meta.url), 'utf8'),
);
const places = JSON.parse(
  readFileSync(new URL('../public/seoul-spots.json', import.meta.url), 'utf8'),
);
// The public source release ships a small sample of places. Checks on corpus size and coverage only apply to the
// full nationwide bundle; the structural checks run on either.
const full = places.length > 50000;
const corpus = { skip: !full && 'needs the full place bundle (the source release ships a sample)' };
test('nationwide records retain Seoul sources and stay inside the extract coverage', () => {
  if (full) {
    assert.ok(places.filter((p) => p.category === 'bathroom' && p.source.includes('Seoul')).length >= 5000);
    assert.ok(places.filter((p) => p.category === 'tourism').length >= 50);
  }
  assert.equal(new Set(places.map((p) => p.id)).size, places.length);
  for (const p of places) {
    assert.ok(!p.id.startsWith('demo-'));
    assert.ok(Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    assert.ok(booleanPointInPolygon([p.longitude, p.latitude], coverage), p.id);
    assert.ok(p.name && p.source && p.evidenceUrl);
    assert.equal(p.verified, false);
  }
});

test('named cafes and enriched source details are bundled for actual browsing', corpus, () => {
  const cafes = places.filter((p) => p.placeType === 'cafe');
  assert.ok(cafes.length > 100);
  assert.ok(cafes.every((p) => p.name && p.name !== 'Parking' && p.category === 'date'));
  assert.ok(cafes.some((p) => p.address && p.website && p.facilities?.opening_hours));
  const restrooms = places.filter((p) => p.category === 'bathroom' && p.source.includes('Seoul'));
  assert.ok(restrooms.some((p) => p.address && p.phone && p.operator));
  assert.ok(restrooms.some((p) => p.facilities?.emergency_bell && p.facilities?.child_toilets !== undefined));
});
test('every source photo has attribution and a license', () => {
  const photos = places.filter((p) => p.image);
  assert.ok(photos.length >= (full ? 4 : 1));
  for (const p of photos) {
    assert.ok(p.image.startsWith('https://'));
    assert.ok(p.imageCredit);
    assert.match(p.imageLicense, /^CC/);
    assert.ok(p.imageSource.startsWith('https://commons.wikimedia.org/'));
  }
});

test('expanded categories retain actual source facts and original update dates', corpus, () => {
  const restaurants = places.filter((p) => p.placeType === 'restaurant');
  assert.ok(restaurants.filter(p => p.category === 'date').every((p) => p.recommendation), 'Generic restaurants cannot be date recommendations');
  for (const type of ['library', 'cinema', 'theatre', 'arts_centre'])
    assert.ok(places.some((p) => p.placeType === type && p.category === 'tourism'), type);
  assert.ok(places.some((p) => p.category === 'bathroom' && p.facilities?.['accessible_stalls:men'] !== undefined));
  assert.ok(places.some((p) => p.category === 'parking' && p.facilities?.maxheight && p.sourceUpdatedAt));
  for (const category of ['popup', 'event'])
    assert.ok(places.filter((p) => p.category === category && p.venue).length >= 100, category);
});
test('bathroom venue layers have explicit source evidence and no restricted access', () => {
  const venues = places.filter(p => p.layers?.includes('bathroom') && p.placeType !== 'toilets');
  if (full) {
    assert.ok(venues.length > 0);
    assert.ok(places.some(p => p.withinPark && p.category === 'bathroom'));
    assert.ok(places.some(p => p.mappedToilets?.count > 0 && ['park', 'garden', 'nature_reserve'].includes(p.placeType)));
  }
  for (const p of venues) {
    assert.equal(p.facilities.toilets, 'yes', p.id);
    assert.ok(!['no', 'private', 'customers', 'permit'].includes(p.facilities['toilets:access']), p.id);
  }
  for (const p of places.filter(p => p.recommendation)) {
    assert.match(p.recommendation.url, /^https:\/\/english\.visitseoul\.net\//);
    assert.equal(p.verified, false);
    assert.ok(p.address && p.checkedAt);
  }
});
test('Android and web use the identical bundled snapshot', () => {
  assert.deepEqual(
    places,
    JSON.parse(
      readFileSync(
        new URL('../../app/src/main/assets/spots.json', import.meta.url),
        'utf8',
      ),
    ),
  );
});

test('zoomed-out samples contain only real source records with bounded payloads', () => {
  const byId = new Map(places.map(p => [p.id, p]));
  for (const category of ['all', 'bathroom', 'parking', 'date', 'tourism', 'popup', 'event']) {
    const sample = JSON.parse(readFileSync(new URL(`../public/places/overview-${category}.json`, import.meta.url), 'utf8'));
    assert.ok(sample.length > 0 && sample.length <= (category === 'all' ? 4800 : 2400));
    assert.equal(new Set(sample.map(p => p.id)).size, sample.length);
    for (const p of sample) {
      const full = byId.get(p.id);
      assert.ok(full, p.id);
      for (const [field, value] of Object.entries(p)) assert.deepEqual(value, full[field], `${p.id}: ${field}`);
      assert.ok(category === 'all' || p.category === category || p.layers?.includes(category));
    }
  }
});
test('parking points are distinct public lots with source rates and no stale occupancy', () => {
  const parking = places.filter(
    (p) => p.category === 'parking' && p.id.startsWith('seoul-parking:'),
  );
  if (full) assert.equal(parking.length, 19);
  assert.equal(new Set(parking.map((p) => p.id)).size, parking.length);
  for (const p of parking) {
    assert.match(p.id, /^seoul-parking:/);
    assert.ok(p.parking.capacity >= 0);
    assert.ok(['NS', 'NW'].includes(p.parking.type));
    assert.ok(p.parking.updatedAt);
    assert.ok(!('cur_parking' in p.parking));
    assert.ok(!('availableSpaces' in p.parking));
    assert.doesNotMatch(p.name, /관광버스|화물|이륜차/);
    if (p.parking.baseFee !== undefined) assert.ok(p.parking.baseMinutes > 0);
    assert.equal(p.verified, false);
  }
});

test('Suwon contains sourced toilets, parking, café street and tourism', corpus, () => {
  const suwon = places.filter(
    (p) =>
      p.latitude > 37.23 &&
      p.latitude < 37.35 &&
      p.longitude > 126.94 &&
      p.longitude < 127.09,
  );
  for (const category of ['bathroom', 'parking', 'date', 'tourism'])
    assert.ok(
      suwon.some((p) => p.category === category),
      category,
    );
});
test('each cell is bounded and every source record is stored once', () => {
  const index = JSON.parse(
    readFileSync(
      new URL('../public/places/index.json', import.meta.url),
      'utf8',
    ),
  );
  const ids = [];
  for (const cell of index) {
    const entries = JSON.parse(
      readFileSync(
        new URL('../public/places/' + cell.file, import.meta.url),
        'utf8',
      ),
    );
    for (const p of entries) {
      assert.ok(p.latitude >= cell.south && p.latitude <= cell.north);
      assert.ok(p.longitude >= cell.west && p.longitude <= cell.east);
      ids.push(p.id);
    }
    assert.deepEqual(
      cell.ids,
      entries.map((p) => p.id),
    );
  }
  assert.equal(ids.length, places.length);
  assert.equal(new Set(ids).size, places.length);
});

test('seasonal snapshot has popup/event dates and no invented verification', () => {
  for (const category of ['popup', 'event']) {
    const records = places.filter((p) => p.category === category);
    assert.ok(records.length >= (full ? 10 : 1));
    for (const p of records.filter((p) => !p.recurrence)) {
      assert.ok(Date.parse(p.endsAt) > Date.parse(p.startsAt));
      assert.ok(p.sourceEndDate && p.checkedAt);
      assert.ok(p.evidenceUrl.startsWith('https://'));
      assert.equal(p.verified, false);
    }
  }
  if (full) assert.ok(places.filter((p) => p.layers?.includes('date')).length >= 20);
});

test('regional expansion has all facility/discovery types across multiple cities', corpus, () => {
  const regional = places.filter((p) => p.id.startsWith('osm:') && p.region);
  assert.ok(regional.length >= 500);
  assert.ok(new Set(regional.map((p) => p.region)).size >= 14);
  for (const category of ['bathroom', 'parking', 'date', 'tourism'])
    assert.ok(regional.some((p) => p.category === category));
  for (const p of regional) {
    assert.match(
      p.evidenceUrl,
      /^https:\/\/www.openstreetmap.org\/(node|way)\/\d+$/,
    );
    assert.ok(p.checkedAt);
    assert.equal(p.verified, false);
  }
});
