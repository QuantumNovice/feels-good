import { isAvailable, type Spot } from '../state';
export type Viewport = {
  south: number;
  north: number;
  west: number;
  east: number;
  latitude: number;
  longitude: number;
  zoom?: number;
};
type Cell = {
  file: string;
  south: number;
  north: number;
  west: number;
  east: number;
};

export function distance(
  a: Pick<Viewport, 'latitude' | 'longitude'>,
  b: Pick<Spot, 'latitude' | 'longitude'>,
) {
  const rad = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * rad,
    dlon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function withinView(p: Spot, v: Viewport) {
  return (
    p.latitude >= v.south &&
    p.latitude <= v.north &&
    p.longitude >= v.west &&
    p.longitude <= v.east &&
    (isOverview(v) || distance(v, p) <= 3000)
  );
}

export function isOverview(view: Viewport) {
  return view.zoom !== undefined && view.zoom <= 12;
}

/** Distribute the marker budget over screen cells and categories. */
export function scatterPlaces(points: Spot[], view: Viewport, limit = 300) {
  const buckets = new Map<string, Spot[]>();
  for (const p of points) {
    const row = Math.min(
      11,
      Math.floor(
        (12 * (p.latitude - view.south)) /
          Math.max(0.0001, view.north - view.south),
      ),
    );
    const col = Math.min(
      19,
      Math.floor(
        (20 * (p.longitude - view.west)) /
          Math.max(0.0001, view.east - view.west),
      ),
    );
    const key = `${row}:${col}:${p.category}`;
    const bucket = buckets.get(key) || [];
    bucket.push(p);
    buckets.set(key, bucket);
  }
  const result: Spot[] = [];
  for (let round = 0; result.length < limit; round++) {
    let added = false;
    for (const bucket of buckets.values()) {
      if (result.length >= limit) break;
      if (bucket[round]) {
        result.push(bucket[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return result;
}

/** Only intersecting geographic cells are requested; stale requests are cancelled. */
export class PlaceSource {
  private index?: Cell[];
  private controller?: AbortController;
  private samples = new Map<string, Spot[]>();
  cancel() {
    this.controller?.abort();
  }
  async query(view: Viewport, category = 'all'): Promise<Spot[]> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const read = async (path: string) => {
      const r = await fetch(new URL('./places/' + path, document.baseURI), {
        signal: controller.signal,
      });
      if (!r.ok) throw Error('place_source');
      return r.json();
    };
    if (isOverview(view)) {
      const key = [
        'bathroom',
        'parking',
        'date',
        'tourism',
        'popup',
        'event',
      ].includes(category)
        ? category
        : 'all';
      const points: Spot[] =
        this.samples.get(key) || (await read(`overview-${key}.json`));
      if (controller.signal.aborted)
        throw new DOMException('Cancelled', 'AbortError');
      this.samples.clear();
      this.samples.set(key, points);
      return scatterPlaces(
        points.filter(
          (p) =>
            withinView(p, view) &&
            isAvailable(p) &&
            (category === 'all' ||
              p.category === category ||
              p.layers?.includes(category)),
        ),
        view,
      );
    }
    this.index ??= await read('index.json');
    const dy = 3000 / 111320,
      dx = dy / Math.max(0.01, Math.cos((view.latitude * Math.PI) / 180));
    const box = {
      south: Math.max(view.south, view.latitude - dy),
      north: Math.min(view.north, view.latitude + dy),
      west: Math.max(view.west, view.longitude - dx),
      east: Math.min(view.east, view.longitude + dx),
    };
    const results: Spot[] = [];
    const cells = this.index!.filter(
      (cell) =>
        !(
          cell.north < box.south ||
          cell.south > box.north ||
          cell.east < box.west ||
          cell.west > box.east
        ),
    );
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(8, cells.length) }, async () => {
        while (cursor < cells.length && !controller.signal.aborted) {
          const points: Spot[] = await read(cells[cursor++].file);
          for (const p of points)
            if (
              withinView(p, view) &&
              isAvailable(p) &&
              (category === 'all' ||
                p.category === category ||
                p.layers?.includes(category))
            )
              results.push(p);
        }
      }),
    );
    if (controller.signal.aborted)
      throw new DOMException('Cancelled', 'AbortError');
    results.sort((a, b) => distance(view, a) - distance(view, b));
    if (category !== 'all') return results.slice(0, 300);
    // Dense toilet clusters must not crowd every other category out of All.
    const chosen = new Map<string, Spot>();
    for (const c of [
      'bathroom',
      'parking',
      'date',
      'tourism',
      'popup',
      'event',
    ])
      for (const p of results
        .filter((p) => p.category === c || p.layers?.includes(c))
        .slice(0, 40))
        chosen.set(p.id, p);
    for (const p of results) {
      if (chosen.size >= 300) break;
      chosen.set(p.id, p);
    }
    return Array.from(chosen.values());
  }
  async detail(place: Spot): Promise<Spot> {
    const cell = `${Math.floor(place.latitude * 100)}-${Math.floor(place.longitude * 100)}.json`;
    const response = await fetch(new URL('./places/' + cell, document.baseURI));
    if (!response.ok) throw Error('place_source');
    const points: Spot[] = await response.json();
    const full = points.find((p) => p.id === place.id);
    if (!full || !isAvailable(full)) throw Error('place_source');
    return full;
  }
  /** Explicit collection export reads cells on demand, rather than retaining all places. */
  async saved(ids: ReadonlySet<string>): Promise<Spot[]> {
    if (!ids.size) return [];
    const r = await fetch(new URL('./places/index.json', document.baseURI));
    if (!r.ok) throw Error('place_source');
    const index: (Cell & { ids: string[] })[] = await r.json(),
      places: Spot[] = [];
    for (const cell of index) {
      if (!cell.ids.some((id) => ids.has(id))) continue;
      const response = await fetch(
        new URL('./places/' + cell.file, document.baseURI),
      );
      if (!response.ok) throw Error('place_source');
      places.push(
        ...((await response.json()) as Spot[]).filter(
          (p) => ids.has(p.id) && isAvailable(p),
        ),
      );
    }
    return places;
  }
}
