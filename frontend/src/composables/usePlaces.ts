import { shallowRef, computed } from 'vue';
import {
  isAvailable,
  applyLocal,
  selectPlaces,
  type Spot,
  type State,
} from '../state';
import {
  PlaceSource,
  withinView,
  isOverview,
  scatterPlaces,
  type Viewport,
} from '../services/places';
import { BrowserSourceStore } from '../services/sourceCache';
import { RemoteSource } from '../services/remoteSource';
import { normalizeSourceUrl } from '../services/sourceUrl';
import { persistPersonalChange } from '../services/personalPlaces';

/** Source snapshots stay outside Vue's deep reactivity. Only small UI selections are reactive. */
export function usePlaces(onError: () => void) {
  const source = new PlaceSource();
  const remote = new RemoteSource(new BrowserSourceStore());
  const empty: State = { spots: [], saved: [], notes: {}, url: '', synced: '' };
  let snapshot: State;
  try {
    snapshot =
      JSON.parse(
        window.Spotlane?.state() || localStorage.getItem('preview') || 'null',
      ) || empty;
  } catch {
    snapshot = empty;
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    snapshot = empty;
  snapshot.spots = Array.isArray(snapshot.spots) ? snapshot.spots : [];
  snapshot.saved = Array.isArray(snapshot.saved) ? snapshot.saved : [];
  snapshot.notes =
    snapshot.notes && typeof snapshot.notes === 'object' ? snapshot.notes : {};
  snapshot.url ||= '';
  snapshot.synced ||= '';
  let curated = new Map(
    snapshot.spots
      .filter((p) => p.source === 'Personal curation')
      .map((p) => [p.id, p]),
  );
  if (!snapshot.url) snapshot.spots = Array.from(curated.values());
  const nearby = shallowRef<Spot[]>([]),
    loading = shallowRef(false),
    saved = shallowRef(new Set(snapshot.saved)),
    revision = shallowRef(0);
  const pool = computed(() => {
    revision.value;
    return snapshot.url
      ? [
          ...curated.values(),
          ...snapshot.spots.filter((p) => !curated.has(p.id)),
        ]
      : [
          ...curated.values(),
          ...nearby.value.filter((p) => !curated.has(p.id)),
        ];
  });
  const sourceInfo = shallowRef({ synced: snapshot.synced, checkedAt: '' });
  const ready = window.Spotlane
    ? Promise.resolve()
    : remote.restore().then((cached) => {
        if (cached) {
          snapshot.url = cached.url;
          snapshot.spots = cached.spots;
          snapshot.synced = cached.synced;
          sourceInfo.value = {
            synced: cached.synced,
            checkedAt: new Date(cached.checkedAt).toISOString(),
          };
          revision.value++;
        } else if (
          snapshot.url &&
          !snapshot.spots.some((p) => p.source !== 'Personal curation')
        )
          snapshot.url = '';
      });
  let generation = 0;
  async function load(view: Viewport, category = 'all') {
    const request = ++generation;
    loading.value = true;
    try {
      await ready;
      const places = snapshot.url
        ? window.Spotlane?.nearby
          ? JSON.parse(
              window.Spotlane.nearby(JSON.stringify({ ...view, category })),
            )
          : isOverview(view)
            ? scatterPlaces(
                selectPlaces(pool.value, saved.value, category, false).filter(
                  (p) => withinView(p, view),
                ),
                view,
              )
            : selectPlaces(pool.value, saved.value, category, false)
                .filter((p) => withinView(p, view))
                .slice(0, 300)
        : await source.query(view, category);
      if (request === generation) nearby.value = places;
    } catch (e) {
      if (request === generation && (e as Error).name !== 'AbortError')
        onError();
    } finally {
      if (request === generation) loading.value = false;
    }
  }
  function action(action: string, payload: unknown) {
    if (
      window.Spotlane &&
      !window.Spotlane.action(action, JSON.stringify(payload))
    ) {
      onError();
      return false;
    }
    if (action === 'share' && !window.Spotlane) {
      navigator.clipboard?.writeText(String(payload)).catch(onError);
      return true;
    }
    if (!['save', 'note', 'curate'].includes(action)) return !!window.Spotlane;
    if (!window.Spotlane) {
      try {
        persistPersonalChange(
          localStorage,
          snapshot,
          curated.values(),
          action,
          payload,
        );
      } catch {
        onError();
        return false;
      }
    }
    if (action !== 'curate' || !snapshot.url)
      applyLocal(snapshot, action, payload);
    if (action === 'curate') {
      const place = payload as Spot;
      curated.set(place.id, place);
    }
    if (action === 'save') saved.value = new Set(snapshot.saved);
    revision.value++;
    return true;
  }
  function select(category: string, savedOnly: boolean, view: Viewport) {
    // Personal pins/overrides take priority even when an imported query hit its cap.
    const candidates = [
      ...curated.values(),
      ...nearby.value.filter((p) => !curated.has(p.id)),
    ];
    const filtered = selectPlaces(
      candidates,
      saved.value,
      category,
      savedOnly,
    ).filter((p) => withinView(p, view));
    return isOverview(view)
      ? scatterPlaces(filtered, view)
      : filtered.slice(0, 300);
  }
  function refresh() {
    if (window.Spotlane) {
      snapshot = JSON.parse(window.Spotlane.state());
      curated = new Map(
        snapshot.spots
          .filter((p) => p.source === 'Personal curation')
          .map((p) => [p.id, p]),
      );
      saved.value = new Set(snapshot.saved);
      revision.value++;
      sourceInfo.value = {
        synced: snapshot.synced,
        checkedAt:
          (snapshot as State & { checkedAt?: string }).checkedAt ||
          snapshot.synced,
      };
    }
  }
  async function shareSaved() {
    const points = snapshot.url
      ? window.Spotlane?.savedPlaces
        ? JSON.parse(window.Spotlane.savedPlaces())
        : pool.value.filter((p) => saved.value.has(p.id) && isAvailable(p))
      : await source.saved(saved.value);
    const merged = new Map((points as Spot[]).map((p) => [p.id, p]));
    for (const p of curated.values())
      if (saved.value.has(p.id) && isAvailable(p)) merged.set(p.id, p);
    return Array.from(merged.values());
  }
  async function fetchSource(input: string, force = true) {
    const url = normalizeSourceUrl(input);
    if (window.Spotlane) return placesNativeFetch(url);
    await ready;
    const cached = await remote.refresh(url, force);
    snapshot.url = cached.url;
    snapshot.spots = cached.spots;
    snapshot.synced = cached.synced;
    sourceInfo.value = {
      synced: cached.synced,
      checkedAt: new Date(cached.checkedAt).toISOString(),
    };
    revision.value++;
    return true;
  }
  function placesNativeFetch(url: string) {
    return window.Spotlane!.action('fetch', JSON.stringify(url));
  }
  async function resetSource() {
    if (window.Spotlane) return window.Spotlane.action('resetSource', 'null');
    await remote.reset();
    snapshot.url = '';
    snapshot.synced = '';
    snapshot.spots = Array.from(curated.values());
    sourceInfo.value = { synced: '', checkedAt: '' };
    revision.value++;
    return true;
  }
  return {
    pool,
    nearby,
    loading,
    ready,
    sourceInfo,
    fetchSource,
    resetSource,
    saved,
    revision,
    select,
    load,
    action,
    refresh,
    shareSaved,
    detail: (place: Spot) =>
      snapshot.url || curated.has(place.id)
        ? Promise.resolve(place)
        : source.detail(place),
    cancel: () => {
      generation++;
      loading.value = false;
      source.cancel();
      remote.cancel();
    },
    note: (id: string) => snapshot.notes[id] || '',
    url: () => snapshot.url,
  };
}
