import type { Spot, Recurrence } from '../state';
export const MAX_SOURCE_BYTES = 2_000_000;
const categories = new Set([
  'bathroom',
  'parking',
  'date',
  'tourism',
  'popup',
  'event',
]);

function validSchedule(schedule: Recurrence) {
  if (
    !schedule ||
    schedule.timezone !== 'Asia/Seoul' ||
    !Array.isArray(schedule.rules) ||
    !schedule.rules.length ||
    schedule.rules.length > 24
  )
    return false;
  for (const rule of schedule.rules) {
    if (
      !Array.isArray(rule.months) ||
      !rule.months.length ||
      rule.months.length > 12 ||
      rule.months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)
    )
      return false;
    if (
      rule.weekdays &&
      (!Array.isArray(rule.weekdays) ||
        !rule.weekdays.length ||
        rule.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
    )
      return false;
    if (
      !Array.isArray(rule.times) ||
      !rule.times.length ||
      rule.times.length > 48 ||
      rule.times.some(
        (t) => typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t),
      )
    )
      return false;
    if (
      rule.durationMinutes !== undefined &&
      (!Number.isFinite(rule.durationMinutes) ||
        rule.durationMinutes <= 0 ||
        rule.durationMinutes > 1440)
    )
      return false;
  }
  for (const field of ['validFrom', 'validThrough'] as const)
    if (schedule[field] && !/^\d{4}-\d{2}-\d{2}$/.test(schedule[field]!))
      return false;
  if (
    schedule.validFrom &&
    schedule.validThrough &&
    schedule.validFrom > schedule.validThrough
  )
    return false;
  return (
    !schedule.excludedDates ||
    (Array.isArray(schedule.excludedDates) &&
      schedule.excludedDates.length <= 1000 &&
      schedule.excludedDates.every(
        (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d),
      ))
  );
}

/** Reject the whole snapshot before replacing a previously usable cache. */
export function validateSource(value: unknown): Spot[] {
  if (!Array.isArray(value) || value.length > 5000)
    throw Error('invalid_source_array');
  const ids = new Set<string>();
  for (const p of value) {
    if (
      !p ||
      typeof p !== 'object' ||
      typeof p.id !== 'string' ||
      !p.id.trim() ||
      ids.has(p.id)
    )
      throw Error('invalid_id');
    ids.add(p.id);
    if (
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      typeof p.source !== 'string' ||
      !p.source.trim() ||
      !categories.has(p.category)
    )
      throw Error('missing_provenance');
    if (
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.latitude) > 90 ||
      Math.abs(p.longitude) > 180
    )
      throw Error('invalid_coordinates');
    if (
      p.verified &&
      (!Number.isFinite(Date.parse(p.verifiedAt)) ||
        typeof p.evidenceUrl !== 'string' ||
        !p.evidenceUrl.startsWith('https://'))
    )
      throw Error('missing_evidence');
    if (p.recurrence !== undefined) {
      if (p.category !== 'event' || !validSchedule(p.recurrence))
        throw Error('invalid_recurrence');
    } else if (['event', 'popup'].includes(p.category)) {
      const end = Date.parse(p.endsAt);
      if (
        !Number.isFinite(end) ||
        (p.startsAt &&
          (!Number.isFinite(Date.parse(p.startsAt)) ||
            Date.parse(p.startsAt) >= end))
      )
        throw Error('invalid_date_range');
    }
    if (p.reviews !== undefined && !Array.isArray(p.reviews))
      throw Error('invalid_reviews');
  }
  return value as Spot[];
}
