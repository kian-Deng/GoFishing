<script setup lang="ts">
import { watch, onBeforeUnmount, nextTick, ref } from 'vue';
import { X } from '@lucide/vue';
import { openOverlay, closeOverlay, topOverlay } from '../lib/overlays';
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
const overlayId = Symbol('sheet');
let previous: HTMLElement | null = null;
function key(event: KeyboardEvent) {
  if (!topOverlay(overlayId)) return;
  if (event.key === 'Escape') {
    event.stopImmediatePropagation();
    emit('close');
  }
  if (event.key === 'Tab') {
    const items = panel.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled):not([hidden]),textarea:not(:disabled),select:not(:disabled)',
    );
    if (!items?.length) return;
    const first = items[0],
      last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
watch(
  () => props.open,
  async (open) => {
    if (open) {
      previous = document.activeElement as HTMLElement;
      openOverlay(overlayId);
      document.addEventListener('keydown', key);
      await nextTick();
      panel.value?.querySelector<HTMLElement>('button')?.focus();
    } else {
      closeOverlay(overlayId);
      document.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  closeOverlay(overlayId);
  document.removeEventListener('keydown', key);
});
</script>
<template>
  <Teleport to="body"
    ><Transition name="sheet"
      ><div v-if="open" class="sheet-backdrop" @click.self="emit('close')">
        <section ref="panel" class="sheet-panel" role="dialog" aria-modal="true" :aria-label="title">
          <div class="sheet-grip" />
          <header class="sheet-header">
            <h2>{{ title }}</h2>
            <button class="icon-button" aria-label="关闭" @click="emit('close')"><X :size="20" /></button>
          </header>
          <div class="sheet-body"><slot /></div>
        </section></div></Transition
  ></Teleport>
</template>
