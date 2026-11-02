<script setup lang="ts">
import { ToolbarRoot, ToolbarButton, ToolbarSeparator } from 'reka-ui';
import UiIcon from './UiIcon.vue';
import { useLanguage } from '../composables/useLanguage';
const { t } = useLanguage();
defineProps<{ showMenu: boolean }>();
defineEmits<{ locate: []; search: []; zoom: [step: number]; menu: [] }>();
</script>
<template>
  <ToolbarRoot
    class="map-tools liquid-glass liquid-glass--static"
    orientation="vertical"
    :aria-label="t('mapTools')"
  >
    <ToolbarButton
      class="icon-only"
      :aria-label="t('searchLocation')"
      @click="$emit('search')"
    >
      <UiIcon name="search" />
    </ToolbarButton>
    <ToolbarButton
      class="icon-only"
      :aria-label="t('locate')"
      @click="$emit('locate')"
    >
      <UiIcon name="locate" />
    </ToolbarButton>
    <ToolbarSeparator class="map-tools-divider" />
    <ToolbarButton
      class="icon-only"
      :aria-label="t('zoomIn')"
      @click="$emit('zoom', 1)"
    >
      <UiIcon name="plus" />
    </ToolbarButton>
    <ToolbarButton
      class="icon-only"
      :aria-label="t('zoomOut')"
      @click="$emit('zoom', -1)"
    >
      <UiIcon name="minus" />
    </ToolbarButton>
    <ToolbarSeparator v-if="showMenu" class="map-tools-divider" />
    <ToolbarButton
      v-if="showMenu"
      class="icon-only menu-toggle"
      :aria-label="t('menu')"
      aria-haspopup="dialog"
      @click="$emit('menu')"
    >
      <UiIcon name="menu" />
    </ToolbarButton>
  </ToolbarRoot>
</template>
