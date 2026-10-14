<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from 'vue';
import { MapPin, Navigation, ArrowUpRight, Layers3 } from '@lucide/vue';
import type { WaterView } from '../../../../packages/shared/src/index';
import { useApp } from '../stores/app';
const props = defineProps<{ waters: WaterView[]; selected?: string }>(),
  emit = defineEmits<{ select: [id: string]; located: [position: { lng: number; lat: number }] }>();
const app = useApp(),
  element = ref<HTMLElement>(),
  error = ref(''),
  loading = ref(false);
let map: any,
  markers: any[] = [];
let disposed = false,
  fitted = false;
declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}
// 浏览器定位为 WGS84；地图适配器用高德 convertFrom 转为展示坐标，不改变私密原坐标。
function convert(points: [number, number][]): Promise<any[]> {
  return new Promise((resolve, reject) =>
    window.AMap.convertFrom(points, 'gps', (status: string, result: any) =>
      status === 'complete' ? resolve(result.locations) : reject(new Error('地图坐标转换失败')),
    ),
  );
}
async function draw() {
  if (!map || !window.AMap) return;
  const data = [...props.waters];
  try {
    const coords = data.length ? await convert(data.map((w) => [w.lng, w.lat])) : [];
    if (disposed) return;
    map.remove(markers);
    markers = data.map((water, index) => {
      const label = document.createElement('span');
      label.textContent = water.name;
      const dot = document.createElement('span');
      dot.className = 'water-map-mark heat-' + water.heat;
      const marker = new window.AMap.Marker({
        position: coords[index],
        content: dot,
        title: water.name,
        label: { content: label, direction: 'top' },
      });
      marker.on('click', () => emit('select', water.id));
      return marker;
    });
    map.add(markers);
    if (markers.length && !fitted) {
      map.setFitView(markers, false, [50, 50, 50, 50]);
      fitted = true;
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function load() {
  const config = app.boot?.config;
  if (!config?.amapKey) return;
  loading.value = true;
  error.value = '';
  try {
    if (!window.AMap) {
      window._AMapSecurityConfig = { securityJsCode: config.amapSecurityCode };
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => reject(new Error('地图加载超时，请检查网络或配置')), 15000);
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.amapKey)}`;
        script.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timer);
          reject(new Error('地图加载失败，请检查 Key 和域名配置'));
        };
        document.head.appendChild(script);
      });
    }
    if (disposed) return;
    map = new window.AMap.Map(element.value, { zoom: 8, center: [106.71, 26.58], viewMode: '2D' });
    await draw();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
async function locate() {
  if (!navigator.geolocation) {
    app.toast(window.isSecureContext ? '当前浏览器不支持定位' : '手机定位需要 HTTPS');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      emit('located', { lng: position.coords.longitude, lat: position.coords.latitude });
      if (map) {
        try {
          const [point] = await convert([[position.coords.longitude, position.coords.latitude]]);
          if (!disposed) map.setZoomAndCenter(13, point);
        } catch (e) {
          app.toast((e as Error).message);
        }
      } else app.toast('定位已获取，配置高德后可在地图展示');
    },
    () => app.toast('定位失败，请检查位置权限'),
    { enableHighAccuracy: true, timeout: 15000 },
  );
}
watch(() => props.waters, draw, { deep: true });
watch(
  () => app.boot?.config.amapKey,
  () => {
    map?.destroy();
    map = null;
    load();
  },
);
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  map?.destroy();
});
</script>
<template>
  <div class="map-canvas">
    <div ref="element" class="map-provider" />
    <div v-if="!app.boot?.config.amapKey || error" class="map-fallback">
      <div class="contour contour-one" />
      <div class="contour contour-two" />
      <div class="contour contour-three" />
      <div class="map-empty-card">
        <span class="map-empty-icon"><MapPin :size="28" :stroke-width="1.5" /></span
        ><span class="eyebrow">YOUR NEXT DISCOVERY</span>
        <h2>{{ error ? '地图连接暂不可用' : '水边的故事，从你开始' }}</h2>
        <p>{{ error || '高德地图待配置。水域列表、素材记录和活动看板可以先使用。' }}</p>
        <RouterLink v-if="app.user?.role === 'admin'" to="/admin" class="text-button"
          >前往系统配置 <ArrowUpRight :size="15" /></RouterLink
        ><span v-else class="map-note">暂无虚构钓点 · 等待真实发现</span>
      </div>
      <span class="placeholder-label">地图待配置 · 背景为装饰纹理</span>
    </div>
    <span class="map-region"><span class="status-dot" />贵州 · 第一季</span
    ><span v-if="loading" class="map-loading">地图加载中…</span>
    <div class="map-tools">
      <button class="icon-button" aria-label="定位到我的位置" @click="locate">
        <Navigation :size="20" /></button
      ><span class="map-tool-label"><Layers3 :size="18" />水域层</span>
    </div>
    <div class="map-legend">
      <span><i class="legend-unlit" />未点亮</span><span><i class="legend-visited" />有人到过</span
      ><span><i class="legend-hot" />近期活跃</span>
    </div>
  </div>
</template>
