<script setup lang="ts">
import EventSchedule from './EventSchedule.vue';
import type { Spot } from '../state';
import type { MessageKey } from '../i18n';
import { useLanguage } from '../composables/useLanguage';
import UiIcon from './UiIcon.vue';
import PlaceImage from './PlaceImage.vue';
defineProps<{ place: Spot; saved: boolean; contextCategory: string }>();
defineEmits<{ navigate: []; save: []; details: []; close: [] }>();
const { language, t } = useLanguage();
</script>
<template>
  <article
    class="selected-card liquid-glass liquid-glass--static"
    :aria-label="t('destination')"
  >
    <div class="selected-summary">
      <PlaceImage :place="place" class="selected-art" />
      <div class="selected-content">
        <p class="selected-type">
          {{
            t(
              (place.layers?.includes(contextCategory)
                ? contextCategory
                : place.category) as MessageKey,
            )
          }}
        </p>
        <h2>{{ place.names?.[language] || place.name }}</h2>
        <EventSchedule v-if="place.recurrence" :place="place" compact />
      </div>
      <button
        class="icon-only dismiss-place"
        :aria-label="t('close')"
        @click="$emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </div>
    <div class="selected-actions">
      <button
        class="active has-icon navigate-primary"
        @click="$emit('navigate')"
      >
        <UiIcon name="navigate" />
        {{ t('navigate') }}
      </button>
      <button class="has-icon" :aria-pressed="saved" @click="$emit('save')">
        <UiIcon name="bookmark" />
        {{ t(saved ? 'unsave' : 'save') }}
      </button>
      <button
        class="more-action has-icon"
        :aria-label="t('details')"
        @click="$emit('details')"
      >
        <UiIcon name="more" />
        <span>{{ t('detailsShort') }}</span>
      </button>
    </div>
  </article>
</template>
