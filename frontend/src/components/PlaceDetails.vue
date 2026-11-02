<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Spot } from '../state';
import EventSchedule from './EventSchedule.vue';
import type { MessageKey } from '../i18n';
import { useLanguage } from '../composables/useLanguage';
import ModalDialog from './ModalDialog.vue';
const props = defineProps<{ place: Spot; note: string }>();
// Shares search by name and address, never the raw coordinates.
const shareText = (p: Spot) =>
  `${p.name}\nhttps://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [p.name, p.address].filter(Boolean).join(' '),
  )}`;
const emit = defineEmits<{
  close: [];
  edit: [];
  action: [action: string, payload: unknown];
  bathrooms: [];
}>();
const { language, t } = useLanguage(),
  note = ref(props.note);
const native = !!window.Spotlane;
const placeTypes: Record<string, MessageKey> = {
  cafe: 'cafe',
  restaurant: 'restaurantPlace',
  library: 'libraryPlace',
  arts_centre: 'artsCentre',
  theatre: 'theatrePlace',
  cinema: 'cinemaPlace',
  camp_site: 'campSite',
  caravan_site: 'caravanSite',
  peak: 'mountainPeak',
  cave_entrance: 'caveEntrance',
  hot_spring: 'hotSpring',
  waterfall: 'waterfall',
  ice_cream: 'iceCream',
  toilets: 'bathroom',
  parking: 'parking',
  museum: 'museumPlace',
  attraction: 'attractionPlace',
  gallery: 'galleryPlace',
  viewpoint: 'viewpointPlace',
  artwork: 'artworkPlace',
  zoo: 'zooPlace',
  aquarium: 'aquariumPlace',
  theme_park: 'themePark',
  monument: 'monumentPlace',
  memorial: 'memorialPlace',
  castle: 'castlePlace',
  archaeological_site: 'archaeologicalSite',
  ruins: 'ruinsPlace',
  fort: 'fortPlace',
  park: 'parkPlace',
  garden: 'gardenPlace',
  nature_reserve: 'natureReserve',
  recreation_ground: 'recreationGround',
  beach: 'beachPlace',
  picnic_site: 'picnicSite',
};
const website = computed(() => {
  try {
    const url = new URL(props.place.website || '');
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
});
const rows = computed(() => {
  const rows: { key: MessageKey; value: string }[] = [],
    p = props.place.parking;
  const add = (key: MessageKey, value: string) => rows.push({ key, value });
  const money = (value: number) =>
    new Intl.NumberFormat(language.value, {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  for (const key of ['operator', 'brand', 'phone'] as const)
    if (props.place[key]) add(key, props.place[key]!);
  for (const key of ['venue', 'organizer'] as const)
    if (props.place[key]) add(key, props.place[key]!);
  const sourceDate = props.place.sourceUpdatedAt;
  if (sourceDate) add('sourceUpdated', sourceDate);
  if (props.place.recordDate) add('snapshotDate', props.place.recordDate);
  if (props.place.startsAt && Number.isFinite(Date.parse(props.place.startsAt)))
    add(
      'startDate',
      new Date(props.place.startsAt).toLocaleString(language.value, {
        timeZone: 'Asia/Seoul',
      }),
    );
  const kind = placeTypes[props.place.placeType || ''];
  if (kind) add('placeKind', t(kind));
  if (p) {
    if (p.type)
      add('parkingType', t(p.type === 'NS' ? 'onStreet' : 'offStreet'));
    if (p.capacity !== undefined) add('capacity', String(p.capacity));
    for (const [field, key] of [
      ['paid', 'payment'],
      ['saturdayPaid', 'saturdayPayment'],
      ['holidayPaid', 'holidayPayment'],
    ] as const)
      if (p[field] !== undefined) add(key, t(p[field] ? 'paid' : 'free'));
    if (p.baseFee !== undefined && p.baseMinutes)
      add('baseFee', `${money(p.baseFee)} / ${p.baseMinutes} ${t('minutes')}`);
    if (p.extraFee !== undefined && p.extraMinutes)
      add(
        'extraFee',
        `${money(p.extraFee)} / ${p.extraMinutes} ${t('minutes')}`,
      );
    if (p.dailyMax !== undefined) add('dailyMax', money(p.dailyMax));
    for (const [field, key] of [
      ['weekdayHours', 'weekdays'],
      ['weekendHours', 'weekends'],
      ['holidayHours', 'holidays'],
      ['updatedAt', 'sourceUpdated'],
    ] as const)
      if (p[field]) add(key, p[field]!);
  }
  for (const [field, key] of [
    ['opening_hours', 'hours'],
    ['wheelchair', 'wheelchair'],
    ['changing_table', 'changingTable'],
    ['access', 'access'],
    ['charge', 'charge'],
    ['toilets', 'toilets'],
    ['drinking_water', 'drinkingWater'],
    ['internet_access', 'internetAccess'],
    ['outdoor_seating', 'outdoorSeating'],
    ['takeaway', 'takeaway'],
    ['cuisine', 'cuisine'],
    ['covered', 'covered'],
    ['parking', 'parkingLayout'],
    ['supervised', 'supervised'],
    ['capacity:disabled', 'accessibleSpaces'],
    ['emergency_bell', 'emergencyBell'],
    ['entrance_cctv', 'entranceCctv'],
    ['child_toilets', 'childToilets'],
    ['accessible_stalls:men', 'accessibleMen'],
    ['accessible_stalls:women', 'accessibleWomen'],
    ['changing_table_location', 'changingTableLocation'],
    ['toilets:wheelchair', 'accessibleToilet'],
    ['toilets:access', 'toiletAccess'],
    ['toilets:opening_hours', 'toiletHours'],
    ['toilets:fee', 'toiletFee'],
    ['toilets:charge', 'toiletCharge'],
    ['toilets:position', 'toiletPosition'],
    ['toilets:disposal', 'toiletDisposal'],
    ['unisex', 'unisexToilet'],
    ['female', 'femaleFacility'],
    ['male', 'maleFacility'],
    ['baby_feeding', 'babyFeeding'],
    ['sanitary_dump_station', 'sanitaryDump'],
    ['shower', 'shower'],
    ['reservation', 'reservation'],
    ['indoor_seating', 'indoorSeating'],
    ['air_conditioning', 'airConditioning'],
    ['smoking', 'smoking'],
    ['diet:vegetarian', 'vegetarian'],
    ['diet:vegan', 'vegan'],
    ['delivery', 'delivery'],
    ['payment:cash', 'cashPayment'],
    ['payment:credit_cards', 'cardPayment'],
    ['maxheight', 'heightLimit'],
    ['maxstay', 'stayLimit'],
    ['lit', 'lighting'],
    ['surface', 'surface'],
    ['capacity:charging', 'chargingSpaces'],
  ] as const) {
    const value = props.place.facilities?.[field];
    if (value && !['unknown', 'not-recorded'].includes(value))
      add(key, value === 'yes' ? t('yes') : value === 'no' ? t('no') : value);
  }
  const fee = props.place.facilities?.fee;
  if (
    fee &&
    fee !== 'unknown' &&
    fee !== 'not-recorded' &&
    p?.paid === undefined
  )
    add('payment', fee === 'yes' ? t('paid') : fee === 'no' ? t('free') : fee);
  return rows;
});
function saveNote() {
  emit('action', 'note', { id: props.place.id, note: note.value });
}
</script>
<template>
  <ModalDialog
    :title="place.names?.[language] || place.name"
    @close="emit('close')"
  >
    <EventSchedule v-if="place.recurrence" :place="place" />
    <p v-if="place.endsAt" class="mb-3">
      {{ t('endDate') }}:
      {{
        new Date(Date.parse(place.endsAt) - 1).toLocaleDateString(language, {
          timeZone: 'Asia/Seoul',
        })
      }}
    </p>
    <p v-if="place.address" class="text-muted mb-4">{{ place.address }}</p>
    <p v-else class="text-muted mb-4">{{ t('addressUnavailable') }}</p>
    <p v-if="place.withinPark" class="cache-status">
      {{ t('withinMappedPark') }}
      <a :href="place.withinPark.url" target="_blank" rel="noopener noreferrer">
        {{ place.withinPark.name }}
      </a>
    </p>
    <div v-if="place.mappedToilets?.count" class="cache-status">
      <p>{{ t('mappedParkToilets') }}: {{ place.mappedToilets.count }}</p>
      <button class="mt-3" @click="emit('bathrooms')">
        {{ t('showBathrooms') }}
      </button>
    </div>
    <p
      v-if="
        place.facilities?.toilets === 'yes' && place.placeType !== 'toilets'
      "
      class="cache-status"
    >
      {{ t('venueToilets') }}
    </p>
    <a
      v-if="place.recommendation?.url?.startsWith('https://')"
      :href="place.recommendation.url"
      target="_blank"
      rel="noopener noreferrer"
      class="nav-option"
    >
      {{ t('recommendedBy') }} {{ place.recommendation.publisher }}
    </a>
    <p v-for="row in rows" :key="row.key" class="mb-3">
      {{ t(row.key) }}: {{ row.value }}
    </p>
    <a
      v-if="website"
      :href="website"
      target="_blank"
      rel="noopener noreferrer"
      class="block mb-3 break-words"
    >
      {{ t('website') }}: {{ website }}
    </a>
    <p v-if="place.parking" class="text-muted my-4">
      {{ t('parkingSnapshot') }}
    </p>
    <textarea
      v-model="note"
      :aria-label="t('notes')"
      :placeholder="t('noteHint')"
      maxlength="4000"
      class="w-full my-3"
    />
    <button @click="saveNote">{{ t('saveNote') }}</button>
    <details class="mt-5">
      <summary class="mb-3">{{ t('more') }}</summary>
      <button @click="emit('edit')">{{ t('edit') }}</button>
      <button
        class="ml-2"
        @click="
          emit(
            'action',
            'share',
            shareText(place),
          )
        "
      >
        {{ t('share') }}
      </button>
      <button
        v-if="native"
        class="mt-3"
        @click="emit('action', 'music', place)"
      >
        {{ t('musicPick') }}
      </button>
      <button
        v-if="native"
        class="mt-3"
        @click="emit('action', 'musicOff', null)"
      >
        {{ t('musicOff') }}
      </button>
      <p v-if="place.reviews?.length" class="my-4 text-muted">
        {{ t('reviews') }}:
        {{ JSON.stringify(place.reviews.slice(0, 20)).slice(0, 12000) }}
      </p>
      <p class="mt-4 text-muted">{{ t('dataCredit') }}: {{ place.source }}</p>
      <p class="mt-2 text-muted">
        {{ t(place.verified ? 'verified' : 'unverified') }}
      </p>
      <a
        v-if="place.evidenceUrl?.startsWith('https://')"
        :href="place.evidenceUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="block mt-2"
      >
        {{ t('source') }}
      </a>
      <p v-if="place.imageCredit" class="mt-4 text-muted">
        {{ t('photoCredit') }}: {{ place.imageCredit }} ·
        {{ place.imageLicense }}
      </p>
      <a
        v-if="place.imageSource?.startsWith('https://')"
        :href="place.imageSource"
        target="_blank"
        rel="noopener noreferrer"
      >
        Wikimedia Commons
      </a>
    </details>
  </ModalDialog>
</template>
