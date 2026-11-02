<script setup lang="ts">
import type { Spot } from '../state';
import ModalDialog from './ModalDialog.vue';
import { useLanguage } from '../composables/useLanguage';
import { track } from '../services/analytics';
const props = defineProps<{ place: Spot }>(),
  emit = defineEmits<{
    close: [];
    action: [action: string, payload: unknown];
  }>();
const { language, t } = useLanguage();
const native = !!window.Spotlane;
const apps: { label: string; packageName: string; provider: string }[] = native
  ? JSON.parse(window.Spotlane!.navigationApps(JSON.stringify(props.place)))
  : [];
const p = props.place;
const links = [
  {
    label: 'Google Maps',
    provider: 'google',
    url: `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}&travelmode=driving`,
  },
  {
    label: 'NAVER Map',
    provider: 'naver',
    url: `https://map.naver.com/p/search/${encodeURIComponent(p.names?.[language.value] || p.name)}`,
  },
  {
    label: 'Kakao Map',
    provider: 'kakao',
    url: `https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.latitude},${p.longitude}`,
  },
];
function navigate(action: string, payload: unknown) {
  const provider =
    action === 'pleos'
      ? 'pleos'
      : (payload as { provider?: string })?.provider || 'other';
  track('navigation_requested', { provider });
  emit('action', action, payload);
  emit('close');
}
</script>
<template>
  <ModalDialog :title="t('choose')" @close="emit('close')">
    <template v-if="native">
      <button class="nav-option" @click="navigate('pleos', place)">
        {{ t('pleos') }}
      </button>
      <button
        v-for="app in apps"
        :key="app.packageName"
        class="nav-option"
        @click="navigate('navigateApp', { place, ...app })"
      >
        {{ app.label }}
      </button>
      <p v-if="!apps.length" class="text-muted">
        {{ t('noNavigationApps') }}
      </p>
    </template>
    <a
      v-for="link in native ? [] : links"
      :key="link.label"
      :href="link.url"
      class="nav-option"
      target="_blank"
      rel="noopener noreferrer"
      @click="track('navigation_requested', { provider: link.provider })"
    >
      {{ link.label }}
    </a>
  </ModalDialog>
</template>
