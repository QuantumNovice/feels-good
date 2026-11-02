export type Spot = {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  source: string;
  address?: string;
  website?: string;
  phone?: string;
  operator?: string;
  brand?: string;
  placeType?: string;
  recommendation?: { publisher: string; url: string };
  withinPark?: { name: string; url: string; basis: string };
  mappedToilets?: { count: number; basis: string };
  notes?: string;
  verified?: boolean;
  verifiedAt?: string;
  evidenceUrl?: string;
  startsAt?: string;
  endsAt?: string;
  recurrence?: Recurrence;
  region?: string;
  layers?: string[];
  sourceEndDate?: string;
  checkedAt?: string;
  sourceUpdatedAt?: string;
  recordDate?: string;
  venue?: string;
  organizer?: string;
  facilities?: Record<string, string>;
  reviews?: unknown[];
  image?: string;
  names?: Record<string, string>;
  imageCredit?: string;
  imageLicense?: string;
  imageSource?: string;
  parking?: {
    capacity?: number;
    paid?: boolean;
    saturdayPaid?: boolean;
    holidayPaid?: boolean;
    baseFee?: number;
    baseMinutes?: number;
    extraFee?: number;
    extraMinutes?: number;
    dailyMax?: number;
    weekdayHours?: string;
    weekendHours?: string;
    holidayHours?: string;
    updatedAt?: string;
    type?: string;
  };
};
export type State = {
  spots: Spot[];
  saved: string[];
  notes: Record<string, string>;
  url: string;
  synced: string;
};
export const PAGE_SIZE = 40;
export const MARKER_LIMIT = 300;

export type Recurrence = {
  timezone: 'Asia/Seoul';
  rules: {
    months: number[];
    weekdays?: number[];
    times: string[];
    durationMinutes?: number;
  }[];
  excludedDates?: string[];
  validFrom?: string;
  validThrough?: string;
  noticeUrl?: string;
};

/** Calendar arithmetic uses KST explicitly, independent of the device timezone. */
export function nextOccurrence(p: Pick<Spot, 'recurrence'>, now = Date.now()) {
  const schedule = p.recurrence;
  if (
    !schedule ||
    schedule.timezone !== 'Asia/Seoul' ||
    !Array.isArray(schedule.rules)
  )
    return undefined;
  const local = new Date(now + 9 * 3600000);
  const midnight =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    9 * 3600000;
  let next: { start: number; end: number } | undefined;
  // Annual schedules may cross New Year or a leap day. Keep iteration bounded.
  for (let day = -1; day <= 370; day++) {
    const base = midnight + day * 86400000,
      date = new Date(base + 9 * 3600000);
    const key = date.toISOString().slice(0, 10);
    if (schedule.validThrough && key > schedule.validThrough) break;
    if (
      (schedule.validFrom && key < schedule.validFrom) ||
      schedule.excludedDates?.includes(key)
    )
      continue;
    for (const rule of schedule.rules) {
      if (
        !rule.months?.includes(date.getUTCMonth() + 1) ||
        (rule.weekdays && !rule.weekdays.includes(date.getUTCDay()))
      )
        continue;
      if (
        rule.durationMinutes !== undefined &&
        !(rule.durationMinutes > 0 && rule.durationMinutes <= 1440)
      )
        continue;
      for (const time of rule.times || []) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
        const [h, m] = time.split(':').map(Number);
        const start = base + (h * 60 + m) * 60000,
          end =
            start + (rule.durationMinutes ? rule.durationMinutes * 60000 : 1);
        if (end > now && (!next || start < next.start)) next = { start, end };
      }
    }
    if (next) return next;
  }
  return undefined;
}

export function scheduledToday(
  p: Pick<Spot, 'category' | 'recurrence' | 'startsAt' | 'endsAt'>,
  now = Date.now(),
) {
  if (p.recurrence) {
    const next = nextOccurrence(p, now);
    return (
      !!next &&
      (next.start <= now ||
        new Date(next.start + 9 * 3600000).toISOString().slice(0, 10) ===
          new Date(now + 9 * 3600000).toISOString().slice(0, 10))
    );
  }
  return (
    isAvailable(p, now) &&
    (!p.startsAt ||
      Date.parse(p.startsAt) <
        Math.floor((now + 9 * 3600000) / 86400000) * 86400000 + 15 * 3600000)
  );
}

/** Timed records without a valid end are hidden rather than becoming permanent pins. */
export function isAvailable(
  p: Pick<Spot, 'category' | 'recurrence' | 'endsAt'>,
  now = Date.now(),
): boolean {
  if (p.category === 'event' && p.recurrence) return !!nextOccurrence(p, now);
  return (
    !['event', 'popup'].includes(p.category) || Date.parse(p.endsAt || '') > now
  );
}

/** Share the icon-widget budget across types without sorting or duplicating records. */
export function* mapCandidates(spots: Spot[]): Generator<Spot> {
  for (const p of spots) if (p.image) yield p;
  const categories = [
    'parking',
    'date',
    'event',
    'popup',
    'tourism',
    'bathroom',
  ];
  const positions = categories.map(() => 0);
  while (positions.some((position) => position < spots.length)) {
    for (let type = 0; type < categories.length; type++) {
      while (positions[type] < spots.length) {
        const p = spots[positions[type]++];
        if (!p.image && p.category === categories[type]) {
          yield p;
          break;
        }
      }
    }
  }
}

export function selectPlaces(
  spots: Spot[],
  saved: ReadonlySet<string>,
  category: string,
  savedOnly: boolean,
  now = Date.now(),
): Spot[] {
  return spots.filter(
    (p) =>
      (category === 'all' ||
        p.category === category ||
        p.layers?.includes(category)) &&
      (!savedOnly || saved.has(p.id)) &&
      isAvailable(p, now),
  );
}

/** Keep one authoritative snapshot; mutate only the affected small collection. */
export function applyLocal(
  state: State,
  action: string,
  payload: unknown,
): void {
  if (action === 'save') {
    const id = String(payload),
      index = state.saved.indexOf(id);
    if (index < 0) state.saved.push(id);
    else state.saved.splice(index, 1);
  } else if (action === 'note') {
    const p = payload as { id: string; note: string };
    state.notes[p.id] = p.note;
  } else if (action === 'curate') {
    const p = payload as Spot,
      index = state.spots.findIndex((s) => s.id === p.id);
    if (index < 0) state.spots.push(p);
    else state.spots[index] = p;
  }
}
