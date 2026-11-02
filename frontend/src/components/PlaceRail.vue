<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Spot } from '../state';
import { PAGE_SIZE } from '../state';
import { useLanguage } from '../composables/useLanguage';
import PlaceImage from './PlaceImage.vue';
import UiIcon from './UiIcon.vue';
const props = defineProps<{
  places: Spot[];
  selected?: string;
  title: string;
  emptyMessage: string;
}>();
defineEmits<{ select: [place: Spot]; close: [] }>();
const { language, t } = useLanguage(),
  page = ref(1);
const pageSize = Math.min(PAGE_SIZE, 4);
const pages = computed(() =>
  Math.max(1, Math.ceil(props.places.length / pageSize)),
);
const rows = computed(() =>
  props.places.slice((page.value - 1) * pageSize, page.value * pageSize),
);
watch(
  () => props.places,
  () => {
    page.value = Math.min(page.value, pages.value);
  },
);
</script>
<template>
  <aside class="place-rail liquid-glass liquid-glass--static">
    <div class="rail-heading">
      <h1>{{ title }} · {{ places.length }}</h1>
      <button
        class="icon-only"
        :aria-label="t('close')"
        @click="$emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </div>
    <div class="place-list">
      <p v-if="!places.length" class="empty-state">{{ emptyMessage }}</p>
      <button
        v-for="p in rows"
        :key="p.id"
        class="place-row"
        :aria-label="p.names?.[language] || p.name"
        :class="{ selected: selected === p.id }"
        @click="$emit('select', p)"
      >
        <PlaceImage :place="p" />
        <span class="place-row-copy">
          <b>{{ p.names?.[language] || p.name }}</b>
          <small>
            {{ p.address || p.operator }}
          </small>
        </span>
        <span class="row-arrow"><UiIcon name="arrow-up-right" /></span>
      </button>
    </div>
    <nav v-if="pages > 1" class="pagination">
      <button
        class="icon-only"
        :disabled="page === 1"
        :aria-label="t('previous')"
        @click="page--"
      >
        <UiIcon name="arrow-left" />
      </button>
      <span>{{ page }} / {{ pages }}</span>
      <button
        class="icon-only"
        :disabled="page === pages"
        :aria-label="t('next')"
        @click="page++"
      >
        <UiIcon name="arrow-right" />
      </button>
    </nav>
  </aside>
</template>
