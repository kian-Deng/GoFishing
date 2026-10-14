<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api, dateText } from '../lib/api';
const route = useRoute(),
  trip = ref<any>(),
  error = ref('');
onMounted(async () => {
  try {
    trip.value = await api('/share/' + String(route.params.id));
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>
<template>
  <section class="share-page">
    <div class="eyebrow">A STORY BY THE WATER</div>
    <h1>{{ trip?.waterName || '水边的故事' }}</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <article v-if="trip">
      <p class="muted">{{ trip.author }} · {{ dateText(trip.createdAt) }}</p>
      <div class="photo-grid">
        <img v-for="photo in trip.assets" :key="photo.id" :src="photo.url" alt="公开出钓照片" />
      </div>
      <p class="prose">{{ trip.note }}</p>
      <p>{{ trip.fish.join(' · ') }}</p>
    </article>
    <RouterLink to="/" class="button primary space-top">去发现更多水域</RouterLink>
  </section>
</template>
