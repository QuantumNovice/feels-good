<script setup lang="ts">
import { ref } from 'vue';
import type { Spot } from '../state';
import { useLanguage } from '../composables/useLanguage';
import type { MessageKey } from '../i18n';
import ModalDialog from './ModalDialog.vue';
const props = defineProps<{ place: Spot }>();
const emit = defineEmits<{
  save: [place: Spot];
  close: [];
  move: [place: Spot];
}>();
const { t } = useLanguage();
const title = ref(props.place.name),
  address = ref(props.place.address || ''),
  category = ref(props.place.category);
const endDate = ref(
  props.place.sourceEndDate?.slice(0, 10) ||
    (props.place.endsAt
      ? new Date(Date.parse(props.place.endsAt) - 1 + 9 * 3600000)
          .toISOString()
          .slice(0, 10)
      : ''),
);
function endInstant() {
  return endDate.value
    ? new Date(
        Date.parse(endDate.value + 'T00:00:00+09:00') + 86400000,
      ).toISOString()
    : undefined;
}
function save() {
  if (
    !title.value.trim() ||
    (['popup', 'event'].includes(category.value) &&
      !(category.value === 'event' && props.place.recurrence) &&
      !endDate.value)
  )
    return;
  emit('save', {
    ...props.place,
    name: title.value.trim(),
    names:
      title.value.trim() === props.place.name ? props.place.names : undefined,
    address: address.value,
    category: category.value,
    recurrence: category.value === 'event' ? props.place.recurrence : undefined,
    endsAt: ['popup', 'event'].includes(category.value)
      ? endInstant()
      : undefined,
    sourceEndDate: ['popup', 'event'].includes(category.value)
      ? endDate.value
      : undefined,
    source: 'Personal curation',
    verified: false,
    evidenceUrl: undefined,
    verifiedAt: undefined,
  });
}
</script>
<template>
  <ModalDialog
    class="place-editor-dialog"
    :title="t(place.name ? 'edit' : 'add')"
    @close="emit('close')"
  >
    <form class="place-editor" @submit.prevent="save">
      <label class="editor-field editor-wide">
        <span>{{ t('placeName') }}</span>
        <input v-model="title" required maxlength="200" />
      </label>
      <label class="editor-field editor-wide">
        <span>{{ t('address') }}</span>
        <input v-model="address" maxlength="400" />
      </label>
      <label class="editor-field">
        <span>{{ t('category') }}</span>
        <select v-model="category">
          <option
            v-for="c in [
              'bathroom',
              'parking',
              'date',
              'tourism',
              'popup',
              'event',
            ]"
            :key="c"
            :value="c"
          >
            {{ t(c as MessageKey) }}
          </option>
        </select>
      </label>
      <label
        v-if="
          ['popup', 'event'].includes(category) &&
          !(category === 'event' && place.recurrence)
        "
        class="editor-field"
      >
        <span>{{ t('endDate') }}</span>
        <input v-model="endDate" type="date" required />
      </label>
      <div class="editor-actions editor-wide">
        <button
          type="button"
          @click="
            emit('move', {
              ...place,
              name: title,
              address,
              category,
              endsAt: endInstant(),
              sourceEndDate: endDate,
            })
          "
        >
          {{ t('changePin') }}
        </button>
        <button type="submit" class="active">{{ t('savePlace') }}</button>
      </div>
    </form>
  </ModalDialog>
</template>
<style scoped>
.place-editor-dialog {
  width: min(640px, calc(100% - 32px));
}
.place-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.editor-wide {
  grid-column: 1 / -1;
}
.editor-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.editor-field > span {
  color: #c6cfdb;
  font-size: 16px;
}
.editor-field input,
.editor-field select {
  width: 100%;
  min-width: 0;
}
.editor-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #ffffff24;
  padding-top: 20px;
  margin-top: 4px;
}
@media (max-width: 540px) {
  .place-editor {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .editor-actions {
    flex-direction: column;
  }
}
</style>
