<script setup lang="ts">
import { onMounted, watch, ref } from 'vue';
import { icon, type IconName } from '../icons';
const props = defineProps<{ name: IconName }>();
const host = ref<HTMLElement>();
function update() {
  host.value?.replaceChildren(icon(props.name));
}
onMounted(update);
watch(() => props.name, update);
</script>
<template><span ref="host" class="ui-icon-host" aria-hidden="true" /></template>
