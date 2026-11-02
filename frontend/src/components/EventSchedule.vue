<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { nextOccurrence, type Spot } from '../state';
import { useLanguage } from '../composables/useLanguage';
const props = defineProps<{ place: Spot; compact?: boolean }>();
const { language, t } = useLanguage();
const now = ref(Date.now());
const next = computed(() => nextOccurrence(props.place, now.value));
const live = computed(() => next.value && next.value.start <= now.value);
function refresh() {
  now.value = Date.now();
}
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  refresh();
  if (document.hidden) return;
  const boundary = next.value
    ? next.value.start > now.value
      ? next.value.start
      : next.value.end
    : now.value + 86400000;
  timer = setTimeout(
    schedule,
    Math.min(Math.max(1, boundary - now.value + 1), 2147483647),
  );
}
onMounted(() => {
  schedule();
  document.addEventListener('visibilitychange', schedule);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', schedule);
});
</script>
<template>
  <div class="event-schedule">
    <strong>{{ t(live ? 'scheduledNow' : 'nextShow') }}</strong>
    <p v-if="next">
      {{
        new Date(next.start).toLocaleString(language, {
          timeZone: 'Asia/Seoul',
          month: 'short',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      }}
      · {{ t('koreaTime') }}
    </p>
    <p v-else>{{ t('scheduleUnconfirmed') }}</p>
    <p v-if="!compact" class="text-muted">{{ t('scheduleCaution') }}</p>
    <a
      v-if="!compact && place.recurrence?.noticeUrl?.startsWith('https://')"
      :href="place.recurrence.noticeUrl"
      target="_blank"
      rel="noopener noreferrer"
    >
      {{ t('checkSchedule') }}
    </a>
  </div>
</template>
