<script setup lang="ts">
import { useLanguage } from '../composables/useLanguage';
import type { MessageKey } from '../i18n';
const { t } = useLanguage();
defineProps<{ category: string; savedOnly: boolean }>();
defineEmits<{ category: [value: string] }>();
const categories = [
  'all',
  'bathroom',
  'parking',
  'date',
  'tourism',
  'popup',
  'event',
];
const image = (category: string) =>
  new URL('./icons/' + category + '.svg', document.baseURI).href;
</script>
<template>
  <nav
    class="map-filters liquid-glass liquid-glass--static"
    :aria-label="t('categories')"
  >
    <button
      v-for="c in categories"
      :key="c"
      :data-category="c"
      :class="{ active: category === c && !savedOnly }"
      :aria-pressed="category === c && !savedOnly"
      @click="$emit('category', c)"
    >
      <img :src="image(c)" alt="" width="32" height="32" />
      <span>{{ t(c as MessageKey) }}</span>
    </button>
  </nav>
</template>
