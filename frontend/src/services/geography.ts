import { distance as turfDistance } from '@turf/distance';
import { bbox } from '@turf/bbox';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import type { Feature, MultiPolygon } from 'geojson';
import coverage from '../assets/korea-coverage.json';

export type Position = { latitude: number; longitude: number };
export const koreaCoverage: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: coverage.properties,
  geometry: { type: 'MultiPolygon', coordinates: coverage.geometry.coordinates },
};
export const koreaBounds = bbox(koreaCoverage);
export const inKoreaExtract = (position: Position) => booleanPointInPolygon(
  [position.longitude, position.latitude], koreaCoverage,
);
export const metersBetween = (a: Position, b: Position) => turfDistance(
  [a.longitude, a.latitude], [b.longitude, b.latitude], { units: 'meters' },
);
export function nearestRegion<T extends Position>(regions: T[], point: Position): T | undefined {
  return regions.reduce<T | undefined>((best, region) =>
    !best || metersBetween(point, region) < metersBetween(point, best) ? region : best, undefined);
}
