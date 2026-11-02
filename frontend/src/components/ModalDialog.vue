<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useLanguage } from '../composables/useLanguage';
import UiIcon from './UiIcon.vue';
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>(),
  element = ref<HTMLDialogElement>(),
  { t } = useLanguage();
onMounted(() => element.value?.showModal());
onBeforeUnmount(() => element.value?.close());
</script>
<template>
  <dialog
    ref="element"
    class="liquid-glass liquid-glass--static"
    :aria-label="title"
    @cancel.prevent="emit('close')"
  >
    <div class="dialog-heading">
      <button class="icon-only" :aria-label="t('close')" @click="emit('close')">
        <UiIcon name="close" />
      </button>
      <h2>{{ title }}</h2>
    </div>
    <div class="dialog-content"><slot /></div>
  </dialog>
</template>
