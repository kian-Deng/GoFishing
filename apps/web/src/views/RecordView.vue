<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, onDeactivated } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import {
  Camera,
  MapPin,
  LocateFixed,
  Plus,
  X,
  Check,
  CloudSun,
  LockKeyhole,
  ArrowRight,
  ImagePlus,
} from '@lucide/vue';
import { get, set, del } from 'idb-keyval';
import { FISH, type Coordinate } from '../../../../packages/shared/src/index';
import { useApp } from '../stores/app';
import { api, send } from '../lib/api';
import Sheet from '../components/Sheet.vue';
import CameraCapture from '../components/CameraCapture.vue';
defineOptions({ name: 'RecordView' });
type Photo = {
  localId: string;
  blob: Blob;
  preview: string;
  kind: 'environment' | 'catch';
  source: 'camera' | 'album';
  assetId?: string;
};
const app = useApp(),
  route = useRoute();
const waterId = ref(''),
  location = ref<Coordinate>(),
  catchStatus = ref<'caught' | 'blank' | 'scout'>('blank'),
  fish = ref<string[]>([]),
  note = ref(''),
  isPublic = ref(false),
  photos = ref<Photo[]>([]),
  cameraKind = ref<'environment' | 'catch' | null>(null),
  locating = ref(false),
  busy = ref(false),
  error = ref(''),
  draftStatus = ref(''),
  result = ref<{ light: boolean; points: number; public: boolean } | null>(null);
let requestId = crypto.randomUUID(),
  draftTimer: ReturnType<typeof setTimeout>,
  restoring = false,
  currentKey = '';
const environment = computed(() => photos.value.filter((p) => p.kind === 'environment')),
  catches = computed(() => photos.value.filter((p) => p.kind === 'catch'));
function clean() {
  photos.value.forEach((p) => URL.revokeObjectURL(p.preview));
  photos.value = [];
}
async function restore() {
  clearTimeout(draftTimer);
  restoring = true;
  currentKey = 'fishing-draft:' + (app.user?.id || 'guest');
  clean();
  location.value = undefined;
  note.value = '';
  fish.value = [];
  waterId.value = String(route.query.water || '');
  catchStatus.value = 'blank';
  isPublic.value = false;
  try {
    const draft = await get<any>(currentKey);
    if (draft) {
      waterId.value = String(route.query.water || draft.waterId || '');
      location.value = draft.location;
      catchStatus.value = draft.catchStatus;
      fish.value = draft.fish;
      note.value = draft.note;
      isPublic.value = draft.public;
      requestId = draft.requestId;
      photos.value = draft.photos.map((p: Photo) => ({ ...p, preview: URL.createObjectURL(p.blob) }));
      draftStatus.value = '已恢复本机草稿';
    }
  } catch {
    draftStatus.value = '当前浏览器无法读取本机草稿';
  } finally {
    restoring = false;
  }
}
function schedule() {
  if (restoring || !app.user) return;
  clearTimeout(draftTimer);
  const key = currentKey;
  draftTimer = setTimeout(async () => {
    try {
      await set(key, {
        waterId: waterId.value,
        location: location.value,
        catchStatus: catchStatus.value,
        fish: [...fish.value],
        note: note.value,
        public: isPublic.value,
        requestId,
        photos: photos.value.map((p) => ({
          localId: p.localId,
          blob: p.blob,
          kind: p.kind,
          source: p.source,
          assetId: p.assetId,
        })),
      });
      draftStatus.value = '草稿已保存在本机';
    } catch {
      draftStatus.value = '草稿保存失败，请勿关闭页面';
    }
  }, 500);
}
watch([waterId, location, catchStatus, fish, note, isPublic, photos], schedule, { deep: true });
watch(() => app.user?.id, restore);
watch(
  () => route.query.water,
  (id) => {
    if (id) waterId.value = String(id);
  },
);
watch(catchStatus, (status) => {
  if (status !== 'caught') fish.value = [];
});
onMounted(restore);
onDeactivated(() => (cameraKind.value = null));
onBeforeUnmount(() => {
  clearTimeout(draftTimer);
  clean();
});
function locate() {
  if (!app.requireLogin()) return;
  if (!navigator.geolocation) {
    error.value = window.isSecureContext
      ? '浏览器不支持定位'
      : '手机定位需要 HTTPS，请打开手机联调的安全地址';
    return;
  }
  locating.value = true;
  error.value = '';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      location.value = {
        lng: position.coords.longitude,
        lat: position.coords.latitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date().toISOString(),
        system: 'WGS84',
      };
      locating.value = false;
      if (!waterId.value && app.waters.length) {
        const near = [...app.waters].sort(
          (a, b) =>
            Math.hypot(a.lng - location.value!.lng, a.lat - location.value!.lat) -
            Math.hypot(b.lng - location.value!.lng, b.lat - location.value!.lat),
        );
        waterId.value = near[0].id;
      }
    },
    () => {
      locating.value = false;
      error.value = '定位失败，请允许位置权限后重试。素材仍可私人保存。';
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
}
function openCamera(kind: 'environment' | 'catch') {
  if (!app.requireLogin()) return;
  if (photos.value.length >= 12) {
    app.toast('每次出钓最多保存 12 张照片');
    return;
  }
  cameraKind.value = kind;
}
function capture(blob: Blob) {
  photos.value.push({
    localId: crypto.randomUUID(),
    blob,
    preview: URL.createObjectURL(blob),
    kind: cameraKind.value!,
    source: 'camera',
  });
  cameraKind.value = null;
}
function remove(photo: Photo) {
  URL.revokeObjectURL(photo.preview);
  photos.value = photos.value.filter((p) => p.localId !== photo.localId);
}
function importPhoto(event: Event) {
  if (!app.requireLogin()) return;
  const input = event.target as HTMLInputElement;
  for (const file of Array.from(input.files || [])) {
    if (photos.value.length >= 12) {
      app.toast('每次最多 12 张');
      break;
    }
    if (file.size > 12 * 1024 * 1024) {
      app.toast('单张图片不能超过 12MB');
      continue;
    }
    photos.value.push({
      localId: crypto.randomUUID(),
      blob: file,
      preview: URL.createObjectURL(file),
      kind: 'environment',
      source: 'album',
    });
  }
  input.value = '';
}
async function save(light: boolean) {
  if (!app.requireLogin()) return;
  error.value = '';
  if (!photos.value.length) {
    error.value = '先拍摄或添加至少一张照片';
    return;
  }
  if (light && (!location.value || !waterId.value || !environment.value.some((p) => p.source === 'camera'))) {
    error.value = '点亮需要定位、选择水域并现场拍摄环境照片';
    return;
  }
  if (light && catchStatus.value === 'caught' && !catches.value.some((p) => p.source === 'camera')) {
    error.value = '有鱼获时，请现场拍摄鱼获照片';
    return;
  }
  busy.value = true;
  clearTimeout(draftTimer);
  try {
    for (const photo of photos.value) {
      if (photo.assetId) continue;
      let token: string | undefined;
      if (photo.source === 'camera')
        token = (await send<{ token: string }>('/media/capture', { kind: photo.kind })).token;
      const form = new FormData();
      form.append('photos', photo.blob, 'capture.jpg');
      form.append('kind', photo.kind);
      form.append('source', photo.source);
      if (token) form.append('token', token);
      const uploaded = await api<{ id: string }>('/media/upload', { method: 'POST', body: form });
      photo.assetId = uploaded.id;
    }
    const response = await send<{ points?: number }>('/trips', {
      waterId: waterId.value || undefined,
      location: location.value,
      assetIds: photos.value.map((p) => p.assetId),
      catchStatus: catchStatus.value,
      fish: fish.value,
      note: note.value,
      public: light && isPublic.value,
      light,
      requestId,
    });
    result.value = { light, points: response.points || 0, public: light && isPublic.value };
    restoring = true;
    clearTimeout(draftTimer);
    await del(currentKey).catch(() => app.toast('记录已保存，本机草稿暂未清理'));
    clean();
    location.value = undefined;
    fish.value = [];
    note.value = '';
    catchStatus.value = 'blank';
    isPublic.value = false;
    requestId = crypto.randomUUID();
    draftStatus.value = '';
    await app.refresh().catch(() => app.toast('记录已保存，列表暂未刷新，请稍后重试'));
  } catch (e) {
    error.value = (e as Error).message;
    schedule();
  } finally {
    busy.value = false;
    setTimeout(() => (restoring = false), 0);
  }
}
</script>
<template>
  <section class="record-page">
    <div class="page-heading">
      <div>
        <div class="eyebrow">COLLECT YOUR MOMENTS</div>
        <h1>记录这次<span class="serif-accent">出钓。</span></h1>
        <p>有鱼获，或只是看看水。每一次出发，都值得留下。</p>
      </div>
      <span class="draft-indicator"
        ><span class="status-dot" />{{ draftStatus || '私人素材 · 自己收藏' }}</span
      >
    </div>
    <div class="record-layout">
      <form class="record-form" :aria-busy="busy" :inert="busy" @submit.prevent="save(true)">
        <section class="form-section">
          <div class="section-title">
            <span class="step-number">01</span>
            <h2>这一站，在哪里</h2>
          </div>
          <div class="location-card">
            <MapPin :size="24" />
            <div>
              <strong>{{ location ? '位置已记录' : '记录你的当前位置' }}</strong
              ><span>{{
                location
                  ? `精度约 ${Math.round(location.accuracy)} 米 · 精确位置不公开`
                  : '点亮时需要定位，私人素材可暂不定位'
              }}</span>
            </div>
            <button type="button" class="button secondary small-button" :disabled="locating" @click="locate">
              <LocateFixed :size="15" />{{ locating ? '定位中…' : location ? '刷新' : '定位' }}
            </button>
          </div>
          <label class="field"
            >所属水域<select v-model="waterId">
              <option value="">{{ app.waters.length ? '请选择附近水域' : '暂无水域，可先保存素材' }}</option>
              <option v-for="water in app.waters" :key="water.id" :value="water.id">
                {{ water.name }} · {{ water.district }}
              </option>
            </select></label
          ><RouterLink to="/library?apply=1" class="text-button"
            >找不到这片水域？申请添加 <ArrowRight :size="14"
          /></RouterLink>
          <div class="weather-note">
            <CloudSun :size="16" />{{
              app.boot?.capabilities.weather ? '天气在提交时自动获取' : '天气待配置，不影响保存和点亮'
            }}<span class="spacer" /><span>省界限制暂未启用</span>
          </div>
        </section>
        <section class="form-section">
          <div class="section-title">
            <span class="step-number">02</span>
            <h2>留下水边的样子</h2>
            <span class="muted small">点亮必填</span>
          </div>
          <div class="capture-grid">
            <button type="button" class="capture-button" @click="openCamera('environment')">
              <Camera :size="27" :stroke-width="1.5" /><strong>拍摄环境照片</strong
              ><span>现场拍摄，点亮这片水域</span>
            </button>
            <div v-for="photo in environment" :key="photo.localId" class="photo-preview">
              <img :src="photo.preview" alt="环境照片预览" /><span class="photo-label">{{
                photo.source === 'camera' ? '现场拍摄' : '相册 · 仅作素材'
              }}</span
              ><button type="button" class="photo-remove" aria-label="移除照片" @click="remove(photo)">
                <X :size="15" />
              </button>
            </div>
          </div>
          <label class="text-button import-label"
            ><ImagePlus :size="15" />从相册收藏素材<input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              @change="importPhoto"
          /></label>
        </section>
        <section class="form-section">
          <div class="section-title">
            <span class="step-number">03</span>
            <h2>今天有什么发现</h2>
          </div>
          <div class="segmented">
            <button
              v-for="item in [
                { id: 'caught', label: '有鱼获' },
                { id: 'blank', label: '空军也开心' },
                { id: 'scout', label: '先来探路' },
              ]"
              :key="item.id"
              type="button"
              :class="{ active: catchStatus === item.id }"
              @click="catchStatus = item.id as typeof catchStatus"
            >
              {{ item.label }}
            </button>
          </div>
          <template v-if="catchStatus === 'caught'"
            ><div class="capture-grid space-top">
              <button type="button" class="capture-button" @click="openCamera('catch')">
                <Camera :size="25" /><strong>拍摄鱼获照片</strong><span>记录真实收获</span>
              </button>
              <div v-for="photo in catches" :key="photo.localId" class="photo-preview">
                <img :src="photo.preview" alt="鱼获照片预览" /><button
                  type="button"
                  class="photo-remove"
                  aria-label="移除鱼获照片"
                  @click="remove(photo)"
                >
                  <X :size="15" />
                </button>
              </div>
            </div>
            <div class="field space-top">
              鱼种 · 可多选
              <div class="fish-tags">
                <label v-for="name in FISH" :key="name" :class="{ active: fish.includes(name) }"
                  ><input v-model="fish" type="checkbox" :value="name" />{{ name }}</label
                >
              </div>
            </div></template
          ><label class="field space-top"
            >出钓笔记 <span class="muted">选填</span
            ><textarea
              v-model="note"
              rows="4"
              maxlength="2000"
              placeholder="今天的水情、饵料，或者一点水边心情…"
            /></label
          ><label class="share-toggle"
            ><input v-model="isPublic" type="checkbox" /><span
              ><strong>点亮时同时分享照片和笔记</strong
              ><small>精确定位不公开；不勾选也能点亮和计分</small></span
            ></label
          >
        </section>
        <div v-if="error" class="inline-notice error-text" role="alert">{{ error }}</div>
        <div class="record-actions">
          <button type="button" class="button secondary" :disabled="busy" @click="save(false)">
            {{ busy ? '保存中…' : '仅保存素材' }}</button
          ><button class="button primary" :disabled="busy">
            <Plus :size="18" />{{ busy ? '正在保存…' : '保存并点亮' }}
          </button>
        </div>
      </form>
      <aside class="record-aside">
        <div class="note-card">
          <LockKeyhole :size="25" />
          <h3>属于你的<br />钓鱼素材库</h3>
          <p>照片、鱼种和笔记按每次出钓归档。想分享的时候，再把故事告诉大家。</p>
          <div class="note-divider" />
          <span><Check :size="15" />没有鱼获也能点亮</span><span><Check :size="15" />提交成功立即生效</span
          ><span><Check :size="15" />精确下竿位置不公开</span>
        </div>
        <p class="small muted">本机草稿不等于云端保存。显示保存成功后，素材才进入账号素材库。</p>
      </aside>
    </div>
  </section>
  <Sheet
    :open="!!cameraKind"
    :title="cameraKind === 'catch' ? '拍摄鱼获' : '拍摄水域环境'"
    @close="cameraKind = null"
    ><CameraCapture v-if="cameraKind" @capture="capture" @close="cameraKind = null"
  /></Sheet>
  <Sheet
    :open="!!result"
    :title="result?.light ? '这片水域，留下了你的足迹' : '这次出钓，已好好收藏'"
    @close="result = null"
    ><div v-if="result" class="success-panel">
      <span class="success-icon"><Check :size="36" /></span>
      <h2>{{ result.light ? '点亮成功' : '素材保存成功' }}</h2>
      <p>{{ result.public ? '照片与笔记已分享，精确位置保持私密。' : '照片和笔记仅自己可见。' }}</p>
      <div v-if="result.light" class="inline-notice">
        {{
          result.points ? `本次获得 ${result.points} 分` : '本次未产生积分，赛季时间与计分规则见活动看板。'
        }}
      </div>
      <div class="action-row">
        <RouterLink to="/library" class="button primary" @click="result = null">查看我的素材</RouterLink
        ><RouterLink to="/activity" class="button secondary" @click="result = null">查看活动进度</RouterLink>
      </div>
    </div></Sheet
  >
</template>
