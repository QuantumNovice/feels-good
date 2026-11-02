<script setup lang="ts">
import { ref } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { useLanguage } from '../composables/useLanguage';
import { normalizeSourceUrl } from '../services/sourceUrl';
const props = defineProps<{ url: string; synced: string; checkedAt: string }>(),
  emit = defineEmits<{ close: []; fetch: [url: string]; osm: []; reset: [] }>();
const url = ref(props.url),
  repositoryPath = ref('places.json'),
  invalid = ref(false),
  { t, language } = useLanguage();
const native = !!window.Spotlane;
function submit() {
  try {
    invalid.value = false;
    emit('fetch', normalizeSourceUrl(url.value, repositoryPath.value));
  } catch {
    invalid.value = true;
  }
}
</script>
<template>
  <ModalDialog :title="t('import')" @close="emit('close')">
    <p class="text-muted mb-4">{{ t('sourceHelp') }}</p>
    <p v-if="props.url" class="cache-status">
      {{ t('cachedSource') }}
      <span v-if="checkedAt">
        · {{ t('lastCheck') }}
        {{ new Date(checkedAt).toLocaleString(language) }}
      </span>
    </p>
    <p v-if="synced" class="text-muted mb-4">
      {{ t('snapshotDate') }}: {{ new Date(synced).toLocaleString(language) }}
    </p>
    <p class="text-muted mb-4">{{ t('refreshPolicy') }}</p>
    <button v-if="native" @click="emit('osm')">{{ t('osm') }}</button>
    <form class="mt-4" @submit.prevent="submit">
      <label class="block">
        {{ t('url') }}
        <input v-model="url" type="url" required class="w-full my-3" />
      </label>
      <label class="block">
        {{ t('repositoryPath') }}
        <input
          v-model="repositoryPath"
          class="w-full my-3"
          placeholder="places.json"
        />
      </label>
      <p v-if="invalid" role="alert">{{ t('invalidSource') }}</p>
      <button type="submit">{{ t('fetch') }}</button>
    </form>
    <button v-if="props.url" class="nav-option" @click="emit('reset')">
      {{ t('useBundled') }}
    </button>
  </ModalDialog>
</template>
