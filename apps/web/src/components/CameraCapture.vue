<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { Camera, RefreshCw } from '@lucide/vue';
const emit = defineEmits<{ capture: [blob: Blob]; close: [] }>();
const video = ref<HTMLVideoElement>(),
  error = ref(''),
  ready = ref(false);
let stream: MediaStream | undefined,
  disposed = false;
async function start() {
  error.value = '';
  ready.value = false;
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error('现场拍摄需要 HTTPS 或本机 localhost，以及支持相机的浏览器。');
    const result = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    if (disposed) {
      result.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = result;
    if (video.value) {
      video.value.srcObject = stream;
      await video.value.play();
      ready.value = true;
    }
  } catch (e) {
    error.value = '无法开启相机：' + (e as Error).message;
  }
}
function capture() {
  const el = video.value;
  if (!el?.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = el.videoWidth;
  canvas.height = el.videoHeight;
  canvas.getContext('2d')!.drawImage(el, 0, 0);
  canvas.toBlob(
    (blob) => {
      if (blob && !disposed) emit('capture', blob);
    },
    'image/jpeg',
    0.92,
  );
}
onMounted(start);
onBeforeUnmount(() => {
  disposed = true;
  stream?.getTracks().forEach((t) => t.stop());
});
</script>
<template>
  <div class="camera-view">
    <video ref="video" autoplay playsinline muted aria-label="相机取景画面" />
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div class="action-row">
      <button v-if="error" class="button secondary" @click="start"><RefreshCw :size="16" />重试相机</button
      ><button class="button primary" :disabled="!ready" @click="capture">
        <Camera :size="18" />拍下这张
      </button>
    </div>
    <p class="small muted">点亮证据使用现场拍摄。相册图片可以保存在个人素材库。</p>
  </div>
</template>
