import { isAvailable, scheduledToday, type Spot } from '../state';
import { distance } from './places';
export type Region = {
  id: string;
  names: Record<string, string>;
  latitude: number;
  longitude: number;
};
export type Target = Pick<
  Spot,
  'category' | 'latitude' | 'longitude' | 'endsAt' | 'startsAt' | 'recurrence'
> & { region: string; count: number; sourceCategory: string };
export type Discovery = { regions: Region[]; targets: Target[] };
export function matchingTargets(
  data: Discovery,
  category: string,
  today = false,
  now = Date.now(),
) {
  return data.targets.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      isAvailable({ ...p, category: p.sourceCategory }, now) &&
      (!today || scheduledToday(p, now)),
  );
}
export function nearestTarget(
  targets: Target[],
  position: { latitude: number; longitude: number },
) {
  return targets.reduce<Target | undefined>(
    (best, p) =>
      !best || distance(position, p) < distance(position, best) ? p : best,
    undefined,
  );
}
