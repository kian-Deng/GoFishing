<script setup lang="ts">
import { Compass } from '@lucide/vue';
defineProps<{ title: string; description: string }>();
</script>
<template>
  <div class="empty-state">
    <span class="empty-symbol"><Compass :size="27" :stroke-width="1.4" /></span>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
