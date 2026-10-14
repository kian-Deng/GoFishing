<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import {
  Images,
  Plus,
  Search,
  LockKeyhole,
  Globe,
  Download,
  Share2,
  MapPin,
  RefreshCw,
  ArrowUpRight,
} from '@lucide/vue';
import { useApp } from '../stores/app';
import { api, send, dateText, dayText } from '../lib/api';
import { shareCard } from '../lib/share-card';
import EmptyState from '../components/EmptyState.vue';
import Sheet from '../components/Sheet.vue';
import type { Coordinate } from '../../../../packages/shared/src/index';
const app = useApp(),
  route = useRoute(),
  records = ref<any[]>([]),
  applications = ref<any[]>([]),
  search = ref(''),
  filter = ref('全部素材'),
  selected = ref<any>(),
  applyOpen = ref(false),
  applicationName = ref(''),
  district = ref(''),
  applicationNote = ref(''),
  applicationLocation = ref<Coordinate>(),
  tripId = ref(''),
  error = ref(''),
  busy = ref(false),
  cardTrip = ref<any>(),
  revokeTrip = ref<any>(),
  revokeReason = ref('');
const visible = computed(() =>
  records.value
    .filter((t) => (t.waterName + t.fish.join('') + t.note + dayText(t.createdAt)).includes(search.value))
    .filter((t) =>
      filter.value === '已点亮'
        ? t.light && !t.revoked
        : filter.value === '仅自己可见'
          ? !t.public && !t.revoked
          : filter.value === '已分享'
            ? t.public && !t.revoked
            : filter.value === '已撤销'
              ? t.revoked
              : !t.revoked,
    ),
);
async function load() {
  if (!app.user) {
    records.value = [];
    applications.value = [];
    return;
  }
  try {
    [records.value, applications.value] = await Promise.all([
      api<any[]>('/trips'),
      api<any[]>('/applications'),
    ]);
  } catch (e) {
    app.toast((e as Error).message);
  }
}
onMounted(async () => {
  await load();
  if (route.query.apply) applyOpen.value = app.requireLogin();
});
watch(() => app.user?.id, load);
async function visibility(trip: any) {
  busy.value = true;
  try {
    await send('/trips/' + trip.id + '/visibility', { public: !trip.public }, 'PATCH');
    await load();
    selected.value = records.value.find((t) => t.id === trip.id);
    app.toast(trip.public ? '已设为仅自己可见' : '已公开分享，精确位置保持私密');
  } catch (e) {
    app.toast((e as Error).message);
  } finally {
    busy.value = false;
  }
}
async function card() {
  try {
    await shareCard(cardTrip.value);
    cardTrip.value = undefined;
    app.toast('分享卡已生成');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') app.toast((e as Error).message);
  }
}
function locate() {
  navigator.geolocation?.getCurrentPosition(
    (p) =>
      (applicationLocation.value = {
        lng: p.coords.longitude,
        lat: p.coords.latitude,
        accuracy: p.coords.accuracy,
        capturedAt: new Date().toISOString(),
        system: 'WGS84',
      }),
    () => app.toast('定位失败，请允许位置权限'),
    { enableHighAccuracy: true, timeout: 15000 },
  );
}
watch(tripId, (id) => {
  const trip = records.value.find((t) => t.id === id);
  if (trip?.location) applicationLocation.value = trip.location;
});
async function apply() {
  if (!app.requireLogin()) return;
  error.value = '';
  if (!applicationLocation.value) {
    error.value = '请获取位置或关联带定位的记录';
    return;
  }
  busy.value = true;
  try {
    await send('/applications', {
      name: applicationName.value,
      district: district.value,
      note: applicationNote.value,
      location: applicationLocation.value,
      tripId: tripId.value || undefined,
    });
    await load();
    applyOpen.value = false;
    applicationName.value = '';
    applicationNote.value = '';
    app.toast('申请已提交，处理结果在素材库查看');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function revoke() {
  busy.value = true;
  try {
    await send('/trips/' + revokeTrip.value.id + '/revoke', { reason: revokeReason.value });
    selected.value = undefined;
    revokeTrip.value = undefined;
    revokeReason.value = '';
    await load();
    await app.refresh();
    app.toast('记录已撤销，关联点亮与成绩已重新计算');
  } catch (e) {
    app.toast((e as Error).message);
  } finally {
    busy.value = false;
  }
}
async function light(trip: any) {
  busy.value = true;
  try {
    await send('/trips', {
      requestId: trip.id,
      waterId: trip.waterId,
      location: trip.location,
      assetIds: trip.assetIds,
      catchStatus: trip.catchStatus,
      fish: trip.fish,
      note: trip.note,
      public: trip.public,
      light: true,
    });
    await load();
    await app.refresh();
    selected.value = records.value.find((t) => t.id === trip.id);
    app.toast('点亮成功，活动成绩已更新');
  } catch (e) {
    app.toast((e as Error).message);
  } finally {
    busy.value = false;
  }
}
const applicationLabels: Record<string, string> = {
  pending: '待采纳',
  accepted: '已采纳',
  rejected: '未采纳',
};
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <div class="eyebrow">YOUR FISHING JOURNAL</div>
        <h1>收藏你的<span class="serif-accent">水边时光。</span></h1>
        <p>环境、鱼获、笔记。把每一次出钓，整理成自己的故事。</p>
      </div>
      <RouterLink to="/record" class="button primary"><Plus :size="17" />记录出钓</RouterLink>
    </div>
    <EmptyState
      v-if="!app.user"
      title="你的故事，从这里开始收藏"
      description="登录后查看属于自己的照片、鱼获和点亮足迹。"
      ><button class="button primary" @click="app.loginOpen = true">登录查看素材</button></EmptyState
    ><template v-else
      ><div class="library-summary">
        <div>
          <Images :size="24" /><strong>{{ records.filter((t) => !t.revoked).length }}</strong
          ><span>次出钓记录</span>
        </div>
        <div>
          <MapPin :size="24" /><strong>{{
            new Set(records.filter((t) => t.light && !t.revoked).map((t) => t.waterId)).size
          }}</strong
          ><span>处点亮水域</span>
        </div>
        <button class="text-button" @click="load"><RefreshCw :size="16" />刷新</button>
      </div>
      <div class="library-tools">
        <div class="filter-row">
          <button
            v-for="item in ['全部素材', '已点亮', '仅自己可见', '已分享', '已撤销']"
            :key="item"
            :class="['filter-chip', { active: filter === item }]"
            @click="filter = item"
          >
            {{ item }}
          </button>
        </div>
        <label class="search-field"
          ><Search :size="17" /><input
            v-model="search"
            aria-label="查找个人素材"
            placeholder="日期、水域、鱼种或笔记"
        /></label>
      </div>
      <EmptyState
        v-if="!visible.length"
        title="等一个值得收藏的瞬间"
        description="现场拍照或从相册添加素材，开始你的出钓日记。"
        ><RouterLink to="/record" class="button secondary">去记录 <ArrowUpRight :size="16" /></RouterLink
      ></EmptyState>
      <div class="journal-grid">
        <button v-for="trip in visible" :key="trip.id" class="journal-card" @click="selected = trip">
          <div class="journal-image">
            <img v-if="trip.assets[0]" :src="trip.assets[0].url" loading="lazy" alt="个人出钓封面" /><span
              :class="['badge', trip.revoked ? 'neutral' : 'green']"
              >{{ trip.revoked ? '已撤销' : trip.light ? '已点亮' : '私人记录' }}</span
            >
          </div>
          <div class="journal-body">
            <span class="small muted">{{ dayText(trip.createdAt) }}</span>
            <h3>{{ trip.waterName }}</h3>
            <p>
              {{
                trip.note ||
                { caught: '今天有收获', blank: '空军也开心，水边走一走', scout: '先来看看，下次再出发' }[
                  trip.catchStatus as string
                ]
              }}
            </p>
            <div class="row small">
              <span>{{ trip.fish.join(' · ') || '一次出钓' }}</span
              ><span class="visibility-label"
                ><Globe v-if="trip.public" :size="13" /><LockKeyhole v-else :size="13" />{{
                  trip.public ? '已分享' : '仅自己可见'
                }}</span
              >
            </div>
          </div>
        </button>
      </div>
      <div class="section-heading space-top">
        <h2>一起补全这张地图</h2>
        <button class="text-button" @click="applyOpen = true"><Plus :size="16" />申请新水域</button>
      </div>
      <p v-if="!applications.length" class="muted">
        发现地图上没有的水域？提交名称、位置与说明，管理员采纳后进入水域列表。
      </p>
      <div v-for="item in applications" :key="item.id" class="application-row">
        <span
          ><strong>{{ item.name }}</strong
          ><small>{{ item.reason || '关联记录会保留原有素材，采纳后可自行点亮。' }}</small></span
        ><span class="badge neutral">{{ applicationLabels[item.status] }}</span>
      </div></template
    >
  </section>
  <Sheet :open="!!selected" :title="selected?.waterName || '出钓素材'" @close="selected = undefined"
    ><template v-if="selected"
      ><div class="row">
        <span>{{ dateText(selected.createdAt) }}</span
        ><span class="badge neutral">{{ selected.public ? '公开分享' : '仅自己可见' }}</span>
      </div>
      <div v-if="selected.revoked" class="inline-notice warning">已撤销：{{ selected.revokeReason }}</div>
      <div class="photo-grid space-top">
        <div v-for="photo in selected.assets" :key="photo.id">
          <img :src="photo.url" alt="自己的出钓照片" /><a
            :href="'/api/media/' + photo.id + '/original'"
            class="text-button"
            download
            ><Download :size="14" />下载照片</a
          >
        </div>
      </div>
      <p class="prose">{{ selected.note || '这次没有写笔记。' }}</p>
      <p class="muted">
        {{ selected.fish.join('、') || '无鱼获记录' }} ·
        {{
          selected.weather.status === 'available'
            ? selected.weather.text + ' ' + selected.weather.temperature + '℃'
            : '天气暂无数据'
        }}
      </p>
      <p class="small muted">
        {{
          selected.location
            ? `本人定位：${selected.location.lng.toFixed(5)}, ${selected.location.lat.toFixed(5)}（其他钓友不可见）`
            : '未记录定位'
        }}
      </p>
      <div v-if="!selected.revoked" class="action-row">
        <button class="button secondary" :disabled="busy" @click="visibility(selected)">
          <Globe :size="15" />{{ selected.public ? '取消公开' : '公开分享' }}</button
        ><button class="button primary" @click="cardTrip = selected"><Share2 :size="15" />生成分享卡</button
        ><button v-if="!selected.light" class="button secondary" :disabled="busy" @click="light(selected)">
          点亮这次记录</button
        ><button class="text-button danger" @click="revokeTrip = selected">撤销记录</button>
      </div></template
    ></Sheet
  >
  <Sheet :open="!!cardTrip" title="分享这段水边故事" @close="cardTrip = undefined"
    ><p>分享卡包含首张照片、水域名称、日期和鱼种。系统不写入精确坐标或私人笔记。</p>
    <p class="small muted">请确认照片本身没有你不想公开的信息。生成分享卡不会自动公开素材库记录。</p>
    <button class="button primary full" @click="card">确认并生成分享卡</button></Sheet
  >
  <Sheet :open="!!revokeTrip" title="撤销这次记录" @close="revokeTrip = undefined"
    ><form class="stack" @submit.prevent="revoke">
      <p>将取消公开和点亮贡献，重新计算关联任务、积分与榜单。照片仍保留在“已撤销”记录中。</p>
      <label class="field"
        >撤销原因<textarea v-model="revokeReason" required minlength="2" maxlength="500" rows="3" /></label
      ><button class="button primary" :disabled="busy">确认撤销</button>
    </form></Sheet
  >
  <Sheet :open="applyOpen" title="发现一片新的水域" @close="applyOpen = false"
    ><form class="stack" @submit.prevent="apply">
      <label class="field"
        >水域名称<input
          v-model="applicationName"
          required
          minlength="2"
          maxlength="80"
          placeholder="当地常用的水域名称" /></label
      ><label class="field"
        >所属地区<input v-model="district" required maxlength="80" placeholder="如：贵阳市 · 清镇市" /></label
      ><label class="field"
        >关联个人出钓记录<select v-model="tripId">
          <option value="">暂不关联</option>
          <option v-for="trip in records.filter((t) => !t.revoked)" :key="trip.id" :value="trip.id">
            {{ dayText(trip.createdAt) }} · {{ trip.waterName }}
          </option>
        </select></label
      ><button type="button" class="button secondary" @click="locate">
        <MapPin :size="16" />{{ applicationLocation ? '已获取位置 · 重新定位' : '获取当前位置' }}</button
      ><label class="field"
        >补充说明<textarea
          v-model="applicationNote"
          rows="3"
          maxlength="1000"
          placeholder="水域情况、名称来源等…"
        />
      </label>
      <p class="small muted">新水域由管理员采纳。贵州区域限制后续接入。</p>
      <p v-if="error" role="alert" class="error-text">{{ error }}</p>
      <button class="button primary full" :disabled="busy">{{ busy ? '提交中…' : '提交新水域申请' }}</button>
    </form></Sheet
  >
</template>
