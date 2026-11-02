<script setup lang="ts">
import {
  computed,
  onMounted,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from 'vue';
import {
  isAvailable,
  scheduledToday,
  nextOccurrence,
  type Spot,
} from './state';
import {
  matchingTargets,
  nearestTarget,
  type Discovery,
} from './services/discovery';
import { isOverview, type Viewport } from './services/places';
import type { MessageKey } from './i18n';
import { useLanguage } from './composables/useLanguage';
import { usePlaces } from './composables/usePlaces';
import { createMap } from './composables/useMap';
import { APP_NAME } from './brand';
import logo from './assets/neu-joh.svg';
import MapFilters from './components/MapFilters.vue';
import PlaceRail from './components/PlaceRail.vue';
import SelectedPlace from './components/SelectedPlace.vue';
import ModalDialog from './components/ModalDialog.vue';
import PlaceEditor from './components/PlaceEditor.vue';
import PlaceDetails from './components/PlaceDetails.vue';
import NavigationDialog from './components/NavigationDialog.vue';
import SourceDialog from './components/SourceDialog.vue';
import UiIcon from './components/UiIcon.vue';
import LocationSearch from './components/LocationSearch.vue';
import MapTools from './components/MapTools.vue';
import VehicleAmbience, { type VehicleSignals } from './components/VehicleAmbience.vue';
import { SOURCE_REFRESH_MS } from './services/remoteSource';
import { track } from './services/analytics';

const { language, t } = useLanguage();
const toast = ref<MessageKey>(),
  element = ref<HTMLElement>(),
  category = ref('all'),
  savedOnly = ref(false);
const selected = shallowRef<Spot>(),
  editing = shallowRef<Spot>(),
  picking = ref(false),
  railOpen = ref(false),
  driving = ref(false),
  drivingNudges = ref(0);
const vehicle = shallowRef<VehicleSignals>({
  brake: false,
  turn: 'off',
  lowBeam: false,
  speedKph: 0,
  acceleration: 0,
  doors: {},
});
const modal = ref<
  'menu' | 'details' | 'navigate' | 'sources' | 'search' | undefined
>();
const view = shallowRef<Viewport>({
  south: 37.54,
  north: 37.59,
  west: 126.94,
  east: 127.01,
  latitude: 37.5665,
  longitude: 126.978,
});
const places = usePlaces(() => notify('failed'));
const overview = computed(() => isOverview(view.value));
const discovery = shallowRef<Discovery>(),
  todayOnly = ref(false);
const targets = computed(() => {
  places.revision.value;
  return discovery.value
    ? matchingTargets(discovery.value, category.value, todayOnly.value)
    : [];
});
const nearest = computed(() => nearestTarget(targets.value, view.value));
function explore(region?: string) {
  const target = nearestTarget(
    targets.value.filter((p) => !region || p.region === region),
    region
      ? discovery.value!.regions.find((r) => r.id === region)!
      : view.value,
  );
  if (target) city(target.latitude, target.longitude);
  else if (region) {
    const r = discovery.value?.regions.find((r) => r.id === region);
    if (r) city(r.latitude, r.longitude);
  }
}
let map: ReturnType<typeof createMap> | undefined,
  toastTimer: ReturnType<typeof setTimeout> | undefined,
  expiryTimer: ReturnType<typeof setTimeout> | undefined;
let sourceTimer: ReturnType<typeof setTimeout> | undefined;
let locationCanCenter = true;
const visible = computed(() => {
  places.revision.value;
  places.nearby.value;
  return places
    .select(category.value, savedOnly.value, view.value)
    .filter((p) => !todayOnly.value || scheduledToday(p));
});
const saved = computed(() => places.saved.value);
function notify(key: MessageKey) {
  toast.value = key;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = undefined), 4500);
}
function action(action: string, payload: unknown) {
  const wasSaved = action === 'save' && saved.value.has(String(payload));
  if (places.action(action, payload)) {
    if (action === 'save')
      track(wasSaved ? 'place_unsaved' : 'place_saved', {
        category: selected.value?.category,
      });
    if (action === 'note') modal.value = undefined;
    return true;
  }
  return false;
}
async function select(place: Spot) {
  if (picking.value) return;
  locationCanCenter = false;
  if (overview.value) {
    try {
      place = await places.detail(place);
    } catch {
      notify('failed');
      return;
    }
  }
  selected.value = place;
  track('place_selected', {
    category: place.category,
    origin:
      place.source === 'Personal curation'
        ? 'personal'
        : places.url()
          ? 'imported'
          : 'bundled',
  });
  railOpen.value = false;
  map?.center(place, overview.value ? 15 : undefined);
}
function load(next: Viewport) {
  view.value = next;
  void places.load(next, category.value);
}
function changeCategory(value: string) {
  track('category_selected', { category: value });
  modal.value = undefined;
  railOpen.value = false;
  category.value = value;
  savedOnly.value = false;
  selected.value = undefined;
  todayOnly.value = false;
  load(view.value);
}
function toggleRail() {
  railOpen.value = !railOpen.value;
  track('places_list_toggled', { open: railOpen.value });
  if (railOpen.value) selected.value = undefined;
}
function toggleSaved() {
  savedOnly.value = !savedOnly.value;
  track('saved_filter_changed', { enabled: savedOnly.value });
  selected.value = undefined;
  railOpen.value = savedOnly.value;
  category.value = 'all';
  todayOnly.value = false;
  load(view.value);
}
function startPin(place?: Spot) {
  modal.value = undefined;
  editing.value = place;
  picking.value = true;
  map?.startPin(place);
}
function confirmPin() {
  const position = map?.finishPin();
  picking.value = false;
  if (!position) return;
  editing.value = {
    ...editing.value,
    id: editing.value?.id || 'local:' + crypto.randomUUID(),
    name: editing.value?.name || '',
    category: editing.value?.category || 'tourism',
    source: 'Personal curation',
    latitude: position.lat,
    longitude: position.lng,
    verified: false,
  };
}
function cancelPin() {
  map?.finishPin();
  picking.value = false;
  editing.value = undefined;
  load(map!.viewport());
}
function savePlace(place: Spot) {
  const isEdit = !!editing.value?.name;
  if (action('curate', place)) {
    track(isEdit ? 'place_edited' : 'place_added', {
      category: place.category,
    });
    editing.value = undefined;
    selected.value = place;
    notify('placeSaved');
    load(map!.viewport());
  }
}
function city(latitude: number, longitude: number) {
  track('region_selected');
  locationCanCenter = false;
  modal.value = undefined;
  selected.value = undefined;
  railOpen.value = false;
  map?.center({ latitude, longitude }, 15);
}
function locate() {
  track('location_requested');
  locationCanCenter = true;
  if (window.Spotlane) {
    if (!window.Spotlane.action('locate', 'null')) notify('locationFailed');
    return;
  }
  if (!navigator.geolocation) {
    notify('locationFailed');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      if (locationCanCenter) map?.locate(p.coords.latitude, p.coords.longitude);
    },
    () => notify('locationFailed'),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
  );
}
async function share() {
  try {
    const saved = await places.shareSaved();
    if (!saved.length) {
      notify('noSaved');
      return;
    }
    action('share', JSON.stringify(saved, null, 2));
    modal.value = undefined;
  } catch {
    notify('failed');
  }
}
async function importSource(actionName: string, payload: unknown) {
  try {
    const ok =
      actionName === 'fetch'
        ? await places.fetchSource(String(payload))
        : action(actionName, payload);
    if (ok) {
      track('source_import_requested', {
        source_type: actionName === 'osm' ? 'osm' : 'https',
      });
      notify(window.Spotlane ? 'loading' : 'success');
      modal.value = undefined;
      load(map!.viewport());
      scheduleSourceRefresh();
    } else notify('failed');
  } catch {
    notify('failed');
  }
}
async function resetSource() {
  try {
    if (await places.resetSource()) {
      track('source_reset');
      modal.value = undefined;
      selected.value = undefined;
      load(map!.viewport());
    } else notify('failed');
  } catch {
    notify('failed');
  }
}
async function refreshRemote() {
  if (window.Spotlane || document.hidden) return;
  await places.ready;
  if (!places.url()) return;
  try {
    await places.fetchSource(places.url(), false);
    load(map!.viewport());
  } catch {
    /* Offline: continue using the last valid cached source. */
  }
}
function scheduleSourceRefresh(retry = false) {
  clearTimeout(sourceTimer);
  if (window.Spotlane || document.hidden || !places.url()) return;
  const checked = Date.parse(places.sourceInfo.value.checkedAt);
  const remaining = Number.isFinite(checked)
    ? SOURCE_REFRESH_MS - (Date.now() - checked)
    : 0;
  sourceTimer = setTimeout(
    async () => {
      await refreshRemote();
      // Failed requests retain their old timestamp. Back off instead of retrying continuously.
      scheduleSourceRefresh(true);
    },
    retry && remaining <= 0 ? SOURCE_REFRESH_MS : Math.max(1, remaining),
  );
}
function visibility() {
  places.cancel();
  clearTimeout(sourceTimer);
  clearTimeout(expiryTimer);
  if (!document.hidden) {
    load(map!.viewport());
    if (selected.value && !isAvailable(selected.value)) {
      selected.value = undefined;
      modal.value = undefined;
    }
    scheduleExpiry();
    void refreshRemote().then(() => scheduleSourceRefresh(true));
  }
}
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const now = Date.now();
  // Recheck scheduled-day filters at KST midnight, including regions without loaded pins.
  let delay = 86400000 - ((now + 9 * 3600000) % 86400000);
  for (const p of [
    ...places.pool.value,
    ...places.nearby.value,
    ...(selected.value ? [selected.value] : []),
  ])
    if (p.category === 'event' || p.category === 'popup') {
      if (p.recurrence) {
        const next = nextOccurrence(p, now);
        if (next)
          for (const boundary of [next.start, next.end])
            if (boundary > now) delay = Math.min(delay, boundary - now);
        continue;
      }
      const remaining = Date.parse(p.endsAt || '') - Date.now();
      if (remaining > 0) delay = Math.min(delay, remaining);
    }
  if (Number.isFinite(delay))
    expiryTimer = setTimeout(
      () => {
        places.revision.value++;
        if (selected.value && !isAvailable(selected.value)) {
          selected.value = undefined;
          modal.value = undefined;
        }
        scheduleExpiry();
      },
      Math.min(delay + 1, 2147483647),
    );
}
watch([visible, language, category], () =>
  map?.paint(
    visible.value,
    (p) => p.names?.[language.value] || p.name,
    category.value,
  ),
);
watch(overview, (value) =>
  track('map_view_changed', { mode: value ? 'overview' : 'local' }),
);
watch(language, (value) => track('language_changed', { language: value }));
watch(modal, (value) => {
  if (value === 'search') track('search_opened');
  if (value === 'details')
    track('place_details_opened', { category: selected.value?.category });
  if (value === 'navigate')
    track('navigation_opened', { category: selected.value?.category });
});
watch(
  [() => places.nearby.value, () => places.revision.value, selected],
  scheduleExpiry,
);
onMounted(() => {
  map = createMap(element.value!, load, select);
  load(map.viewport());
  void fetch(new URL('./places/discovery.json', document.baseURI))
    .then((r) => {
      if (!r.ok) throw Error('discovery');
      return r.json();
    })
    .then((data) => (discovery.value = data))
    .catch(() => notify('failed'));
  window.spotlaneLocation = (lat, lon) => {
    if (locationCanCenter) map?.locate(lat, lon);
  };
  window.spotlaneLocationError = () => notify('locationFailed');
  window.spotlaneDriving = (moving) => {
    driving.value = moving;
    document.documentElement.classList.toggle('vehicle-driving', moving);
  };
  window.spotlaneDriving(window.Spotlane?.driving?.() ?? false);
  window.spotlaneVehicle = (signals) => (vehicle.value = signals);
  if (window.Spotlane) locate();
  else if (navigator.permissions)
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((permission) => {
        if (permission.state === 'granted') locate();
      })
      .catch(() => {
        /* Location remains available through the map control. */
      });
  window.spotlaneResult = (ok, changed = true) => {
    if (ok) {
      places.refresh();
      if (changed) load(map!.viewport());
    }
    notify(ok ? 'success' : 'failed');
  };
  document.addEventListener('visibilitychange', visibility);
  void refreshRemote().then(() => scheduleSourceRefresh(true));
});
onBeforeUnmount(() => {
  places.cancel();
  map?.destroy();
  clearTimeout(toastTimer);
  clearTimeout(expiryTimer);
  clearTimeout(sourceTimer);
  document.removeEventListener('visibilitychange', visibility);
  delete window.spotlaneLocation;
  delete window.spotlaneLocationError;
  delete window.spotlaneResult;
  delete window.spotlaneDriving;
  delete window.spotlaneVehicle;
});
</script>

<template>
  <main class="map-shell" :class="{ 'rail-open': railOpen }">
    <div id="map" ref="element" :aria-label="t('all')" />
    <MapFilters
      v-if="!picking"
      :category="category"
      :saved-only="savedOnly"
      @category="changeCategory"
    />
    <div class="discovery-controls liquid-glass liquid-glass--static">
      <span class="nearby-count" role="status">
        {{
          places.loading.value
            ? t('loading')
            : `${visible.length}${visible.length === 300 && !overview ? '+' : ''} ${t(overview ? 'shownOnMap' : 'nearbyShort')}`
        }}
      </span>
      <button
        v-if="!picking"
        class="rail-toggle has-icon"
        :aria-expanded="railOpen"
        :class="{ 'is-selected': railOpen }"
        @click="toggleRail"
      >
        <UiIcon name="list" />
        {{ t('places') }}
      </button>
      <button
        v-if="!picking"
        class="saved-button has-icon"
        :class="{ active: savedOnly }"
        :aria-label="t('saved')"
        :aria-pressed="savedOnly"
        @click="toggleSaved"
      >
        <UiIcon name="bookmark" />
        <span>{{ t('savedShort') }}</span>
      </button>
      <button
        v-if="category === 'event' || category === 'popup'"
        :class="{ active: todayOnly }"
        :aria-pressed="todayOnly"
        @click="todayOnly = !todayOnly"
      >
        {{ t('todayOnly') }}
      </button>
    </div>
    <div
      v-if="!visible.length && !picking && !places.loading.value && !railOpen"
      class="map-empty liquid-glass liquid-glass--static"
    >
      <p>{{ t(savedOnly ? 'emptySavedHere' : 'emptyHere') }}</p>
      <button
        v-if="nearest && !savedOnly && !places.url()"
        class="has-icon"
        @click="explore()"
      >
        <UiIcon name="arrow-up-right" />
        {{ t('findPlaces') }}
      </button>
    </div>
    <PlaceRail
      v-if="railOpen"
      :places="visible"
      :selected="selected?.id"
      :title="t(savedOnly ? 'saved' : (category as MessageKey))"
      :empty-message="t(savedOnly ? 'emptySavedHere' : 'emptyHere')"
      @select="select"
      @close="railOpen = false"
    />
    <SelectedPlace
      v-if="selected && !picking"
      :key="selected.id"
      :place="selected"
      :context-category="category"
      :saved="saved.has(selected.id)"
      @navigate="modal = 'navigate'"
      @save="action('save', selected!.id)"
      @details="modal = 'details'"
      @close="selected = undefined"
    />
    <MapTools
      :show-menu="!picking"
      @menu="modal = 'menu'"
      @locate="locate"
      @search="modal = 'search'"
      @zoom="map?.zoom($event)"
    />
    <div v-if="picking" class="pin-toolbar liquid-glass liquid-glass--static">
      <span>{{ t('pickPin') }}</span>
      <button class="active" @click="confirmPin">{{ t('usePin') }}</button>
      <button @click="cancelPin">{{ t('close') }}</button>
    </div>
  </main>
  <LocationSearch
    v-if="modal === 'search'"
    :regions="discovery?.regions || []"
    @close="modal = undefined"
    @select="(region) => city(region.latitude, region.longitude)"
  />
  <ModalDialog
    v-if="modal === 'menu'"
    :title="t('menu')"
    @close="modal = undefined"
  >
    <div class="brand menu-brand" :title="APP_NAME">
      <img class="brand-logo" :src="logo" alt="" width="40" height="40" />
      <span>
        <b>{{ t('appTitle') }}</b>
      </span>
    </div>
    <div class="language-settings" role="group" :aria-label="t('language')">
      <h3>{{ t('language') }}</h3>
      <div class="language-options">
        <button
          v-for="l in ['en', 'ko', 'ja'] as const"
          :key="l"
          :class="{ active: language === l }"
          :aria-pressed="language === l"
          @click="language = l"
        >
          {{ { en: 'English', ko: '한국어', ja: '日本語' }[l] }}
        </button>
      </div>
    </div>
    <button class="nav-option" @click="startPin()">{{ t('add') }}</button>
    <button class="nav-option" @click="modal = 'sources'">
      {{ t('import') }}
    </button>
    <button class="nav-option" @click="share">
      {{ t('shareCollection') }}
    </button>
  </ModalDialog>
  <PlaceEditor
    v-if="editing && !picking"
    :place="editing"
    @save="savePlace"
    @close="editing = undefined"
    @move="startPin($event)"
  />
  <PlaceDetails
    v-if="modal === 'details' && selected"
    :place="selected"
    :note="places.note(selected.id)"
    @close="modal = undefined"
    @action="action"
    @bathrooms="changeCategory('bathroom')"
    @edit="
      modal = undefined;
      editing = selected;
    "
  />
  <NavigationDialog
    v-if="modal === 'navigate' && selected"
    :place="selected"
    @close="modal = undefined"
    @action="action"
  />
  <SourceDialog
    v-if="modal === 'sources'"
    :url="places.url()"
    :synced="places.sourceInfo.value.synced"
    :checked-at="places.sourceInfo.value.checkedAt"
    @close="modal = undefined"
    @fetch="importSource('fetch', $event)"
    @osm="importSource('osm', null)"
    @reset="resetSource"
  />
  <div
    v-if="toast"
    class="app-toast liquid-glass liquid-glass--static"
    role="status"
  >
    {{ t(toast) }}
  </div>
  <VehicleAmbience :signals="vehicle" />
  <!-- While driving the app stays visible; this clear shield takes taps and answers each with a gentle nudge. -->
  <div v-if="driving" class="driving-lock" @pointerdown="drivingNudges++">
    <p :key="drivingNudges" class="liquid-glass liquid-glass--static" role="status">
      {{ t('drivingPaused') }}
    </p>
  </div>
</template>
