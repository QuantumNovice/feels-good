<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxEmpty,
} from 'reka-ui';
import type { Region } from '../services/discovery';
import { useLanguage } from '../composables/useLanguage';
import UiIcon from './UiIcon.vue';
const props = defineProps<{ regions: Region[]; value?: string }>();
const emit = defineEmits<{ select: [id: string] }>();
const { t, language } = useLanguage();
const query = ref(''),
  open = ref(false);
const label = (region: Region) =>
  region.names[language.value] || region.names.en;
const display = (value: unknown) => {
  const region = props.regions.find((r) => r.id === value);
  return region ? label(region) : '';
};
const matches = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return props.regions
    .filter(
      (r) =>
        !term ||
        Object.values(r.names).some((name) =>
          name.toLocaleLowerCase().includes(term),
        ),
    )
    .slice(0, 60);
});
watch(open, (value) => {
  if (value) query.value = '';
});
function choose(value: unknown) {
  if (typeof value === 'string') emit('select', value);
}
</script>
<template>
  <ComboboxRoot
    class="region-picker"
    :model-value="value"
    v-model:open="open"
    ignore-filter
    open-on-click
    @update:model-value="choose"
  >
    <ComboboxAnchor class="region-anchor">
      <UiIcon name="pin" />
      <ComboboxInput
        v-model="query"
        :display-value="display"
        :aria-label="t('region')"
        :placeholder="t('searchKorea')"
        autocomplete="off"
      />
      <ComboboxTrigger :aria-label="t('openRegions')" class="region-chevron">
        <UiIcon name="chevron-down" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        class="region-menu"
        position="popper"
        align="start"
        :side-offset="10"
        :collision-padding="12"
      >
        <div class="region-menu-heading">
          {{ t('searchKorea') }}
          <span>{{ regions.length }}</span>
        </div>
        <ComboboxViewport class="region-options">
          <ComboboxEmpty class="region-no-results">
            {{ t('noRegions') }}
          </ComboboxEmpty>
          <ComboboxItem
            v-for="region in matches"
            :key="region.id"
            :value="region.id"
            class="region-option"
          >
            <span class="region-option-copy">
              <b>{{ label(region) }}</b>
              <small>
                {{ language === 'en' ? region.names.ko : region.names.en }}
              </small>
            </span>
            <ComboboxItemIndicator>
              <UiIcon name="check" />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
