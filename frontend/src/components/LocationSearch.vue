<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Region } from '../services/discovery';
import { useLanguage } from '../composables/useLanguage';
import ModalDialog from './ModalDialog.vue';
import UiIcon from './UiIcon.vue';

const props = defineProps<{ regions: Region[] }>();
const emit = defineEmits<{ close: []; select: [region: Region] }>();
const { language, t } = useLanguage();
const query = ref('');
const label = (region: Region) =>
  region.names[language.value] || region.names.en;
const matches = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  if (!term) return [];
  return props.regions
    .filter((region) =>
      Object.values(region.names).some((name) =>
        name.toLocaleLowerCase().includes(term),
      ),
    )
    .slice(0, 30);
});
</script>

<template>
  <ModalDialog :title="t('searchLocation')" @close="emit('close')">
    <label class="location-search-input">
      <UiIcon name="search" />
      <input
        v-model="query"
        type="search"
        :aria-label="t('searchLocation')"
        :placeholder="t('searchLocation')"
        autocomplete="off"
        autofocus
      />
    </label>
    <div v-if="query.trim()" class="location-search-results">
      <p v-if="!matches.length" class="text-muted">{{ t('noRegions') }}</p>
      <button
        v-for="region in matches"
        :key="region.id"
        class="nav-option"
        @click="emit('select', region)"
      >
        <UiIcon name="pin" />
        <span>{{ label(region) }}</span>
        <small class="text-muted">
          {{ language === 'en' ? region.names.ko : region.names.en }}
        </small>
      </button>
    </div>
  </ModalDialog>
</template>
