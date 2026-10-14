<script setup lang="ts">
import { computed, ref, onActivated, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  ArrowUpRight,
  Search,
  Navigation,
  Fish,
  MapPin,
  ShieldCheck,
} from '@lucide/vue';
import { useApp } from '../stores/app';
import { api } from '../lib/api';
import MapCanvas from '../components/MapCanvas.vue';
import EmptyState from '../components/EmptyState.vue';
import Sheet from '../components/Sheet.vue';
import type { WaterView } from '../../../../packages/shared/src/index';
defineOptions({ name: 'MapView' });
const app = useApp(),
  router = useRouter(),
  filter = ref('全部水域'),
  search = ref(''),
  selected = ref<{ water: WaterView; records: any[] } | null>(null),
  loading = ref(false),
  userPosition = ref<{ lng: number; lat: number } | null>(null),
  locating = ref(false),
  locationHint = ref('定位后按距离排序');
const filters = ['全部水域', '已点亮', '我的点亮', '待探水域', '本季任务', '管理员推荐'];
const route = useRoute();
watch(
  () => route.query.layer,
  (value) => {
    if (typeof value === 'string' && filters.includes(value)) filter.value = value;
  },
  { immediate: true },
);
function distanceKm(water: WaterView) {
  if (!userPosition.value) return null;
  const radians = Math.PI / 180;
  const latDelta = (water.lat - userPosition.value.lat) * radians;
  const lngDelta = (water.lng - userPosition.value.lng) * radians;
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(userPosition.value.lat * radians) *
      Math.cos(water.lat * radians) *
      Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function distanceLabel(water: WaterView) {
  const distance = distanceKm(water);
  if (distance === null) return '';
  return distance < 1 ? `距你 ${Math.round(distance * 1000)} 米` : `距你 ${distance.toFixed(1)} 公里`;
}
const items = computed(() =>
  app.waters
    .filter((w) => (w.name + w.district).includes(search.value))
    .filter((w) =>
      filter.value === '已点亮'
        ? w.lit
        : filter.value === '我的点亮'
          ? w.mine
          : filter.value === '待探水域'
            ? w.pendingExplore
            : filter.value === '本季任务'
              ? w.seasonTask
              : filter.value === '管理员推荐'
                ? w.recommended
                : true,
    )
    .sort((a, b) => {
      if (!userPosition.value) return 0;
      return distanceKm(a)! - distanceKm(b)!;
    }),
);
const lit = computed(() => app.waters.filter((w) => w.lit).length);
onActivated(() => app.refresh().catch((e) => app.toast(e.message)));
function locateForList() {
  if (!window.isSecureContext || !navigator.geolocation) {
    locationHint.value = '手机定位需使用 HTTPS';
    return;
  }
  locating.value = true;
  locationHint.value = '定位中…';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userPosition.value = { lng: position.coords.longitude, lat: position.coords.latitude };
      locating.value = false;
      locationHint.value = '按距离由近到远';
    },
    () => {
      locating.value = false;
      locationHint.value = '定位失败，点击重试';
    },
    { enableHighAccuracy: true, timeout: 15000 },
  );
}
onMounted(locateForList);
async function select(id: string) {
  loading.value = true;
  try {
    selected.value = await api('/waters/' + id);
  } catch (e) {
    app.toast((e as Error).message);
  } finally {
    loading.value = false;
  }
}
function navigate() {
  const w = selected.value?.water;
  if (!w || w.entryLng === undefined || w.entryLat === undefined) {
    app.toast('该水域尚未维护公开入口');
    return;
  }
  window.open(
    `https://uri.amap.com/navigation?to=${w.entryLng},${w.entryLat},${encodeURIComponent(w.name + '公开入口')}&mode=car&coordinate=wgs84&callnative=1`,
    '_blank',
    'noopener,noreferrer',
  );
}
const heatLabel = { unlit: '尚未点亮', visited: '有人到过', recent: '近期持续', hot: '近期火热' };
</script>
<template>
  <section class="map-page">
    <div class="explore-layout">
      <div class="explore-main">
        <div class="map-toolbar">
          <label class="search-field"
            ><Search :size="18" /><input
              v-model="search"
              aria-label="搜索水域或地区"
              placeholder="搜索水域、地区…" /></label
          ><span class="map-count">{{ app.waters.length }} 处水域 / {{ lit }} 处已点亮</span>
        </div>
        <div class="filter-row" aria-label="水域图层">
          <button
            v-for="item in filters"
            :key="item"
            :class="['filter-chip', { active: filter === item }]"
            @click="filter = item"
          >
            {{ item }}
          </button>
        </div>
        <MapCanvas
          :waters="items"
          :selected="selected?.water.id"
          @select="select"
          @located="userPosition = $event; locationHint = '按距离由近到远'" />
        <div class="privacy-line">
          <ShieldCheck :size="15" />公共地图仅展示水域汇总，保护你的精确下竿位置。
        </div>
      </div>
    </div>
    <div class="section-heading">
      <h2>
        附近钓点 <span class="count-badge">{{ items.length }}</span>
      </h2>
      <button class="distance-action" :disabled="locating" @click="locateForList">
        <Navigation :size="14" />{{ locationHint }}
      </button>
    </div>
    <div v-if="items.length" class="water-grid">
      <button v-for="water in items" :key="water.id" class="water-card" @click="select(water.id)">
        <div class="row">
          <span :class="['badge', water.lit ? 'green' : 'neutral']">{{ heatLabel[water.heat] }}</span
          ><ArrowUpRight :size="17" />
        </div>
        <h3>{{ water.name }}</h3>
        <p><MapPin :size="13" />{{ water.district }}<span v-if="userPosition"> · {{ distanceLabel(water) }}</span></p>
        <div class="water-card-footer">
          <span>{{ water.recordCount }} 次有效记录</span
          ><span>{{ water.fish.slice(0, 3).join(' · ') || '鱼种待发现' }}</span>
        </div>
      </button>
    </div>
    <p v-if="loading" class="muted" role="status">正在查看水域…</p>
  </section>
  <Sheet :open="!!selected" :title="selected?.water.name || '水域详情'" @close="selected = null"
    ><template v-if="selected"
      ><span class="badge green">{{ heatLabel[selected.water.heat] }}</span>
      <p class="muted">{{ selected.water.district }}</p>
      <p>{{ selected.water.description || '这片水域的故事，等待钓友共同补充。' }}</p>
      <div v-if="selected.water.warning" class="inline-notice warning">{{ selected.water.warning }}</div>
      <div class="detail-stats">
        <div>
          <strong>{{ selected.water.recordCount }}</strong
          ><span>有效记录</span>
        </div>
        <div>
          <strong>{{ selected.water.visitors }}</strong
          ><span>近期钓友</span>
        </div>
        <div>
          <Fish :size="22" /><span>{{ selected.water.fish.join('、') || '暂无鱼种记录' }}</span>
        </div>
      </div>
      <h3>如何到达</h3>
      <p class="muted">{{ selected.water.entryNote || '暂无公开入口说明' }}</p>
      <div class="action-row">
        <button
          class="button primary"
          :disabled="selected.water.entryLng === undefined || selected.water.entryLat === undefined"
          @click="navigate"
        >
          <Navigation :size="16" />导航到公开入口</button
        ><button
          class="button secondary"
          @click="
            router.push({ path: '/record', query: { water: selected.water.id } });
            selected = null;
          "
        >
          在这里记录
        </button>
      </div>
      <h3 class="space-top">钓友分享</h3>
      <EmptyState
        v-if="!selected.records.length"
        title="还没有公开的出钓故事"
        description="点亮与素材分享由你分别决定。" />
      <article v-for="trip in selected.records" :key="trip.id" class="feed-item">
        <strong>{{ trip.author }}</strong>
        <p>{{ trip.note || '记录了一次出钓' }}</p>
        <div class="photo-grid">
          <img
            v-for="photo in trip.assets"
            :key="photo.id"
            :src="photo.url"
            loading="lazy"
            alt="钓友公开分享的出钓照片"
          />
        </div></article></template
  ></Sheet>
</template>
