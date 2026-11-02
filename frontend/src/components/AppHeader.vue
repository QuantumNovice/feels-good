<script setup lang="ts">
import UiIcon from './UiIcon.vue';
import { APP_NAME } from '../brand';
import { useLanguage } from '../composables/useLanguage';
import logo from '../assets/neu-joh.svg';
const { t } = useLanguage();
defineProps<{ savedOnly: boolean }>();
defineEmits<{ menu: []; saved: [] }>();
</script>
<template>
  <header class="app-header">
    <div class="brand" :title="APP_NAME">
      <img class="brand-logo" :src="logo" alt="" width="40" height="40" />
      <span>
        <b lang="ko">느좋</b>
        <small>neu-joh</small>
      </span>
    </div>
    <div class="header-controls">
      <button
        class="has-icon saved-button"
        :class="{ active: savedOnly }"
        :aria-label="t('saved')"
        :aria-pressed="savedOnly"
        @click="$emit('saved')"
      >
        <UiIcon name="bookmark" />
        <span>{{ t('savedShort') }}</span>
      </button>
      <button class="icon-only" :aria-label="t('menu')" @click="$emit('menu')">
        <UiIcon name="menu" />
      </button>
    </div>
  </header>
</template>
