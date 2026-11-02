<script setup lang="ts">
import type { Spot } from '../state';
defineProps<{ place: Spot }>();
const fallback = (p: Spot) =>
  new URL('./icons/' + p.category + '.svg', document.baseURI).href;
function failed(event: Event) {
  const image = event.target as HTMLImageElement;
  image.onerror = null;
  image.src = new URL('./icons/tourism.svg', document.baseURI).href;
}
</script>
<template>
  <img
    :src="place.image || fallback(place)"
    alt=""
    width="64"
    height="64"
    loading="lazy"
    decoding="async"
    @error="failed"
  />
</template>
