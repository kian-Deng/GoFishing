<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Plus, Settings2, Download, RefreshCw, ArrowLeft, Save, MapPin } from '@lucide/vue';
import { RouterLink, useRoute } from 'vue-router';
import { useApp } from '../stores/app';
import { api, send, dateText } from '../lib/api';
import Sheet from '../components/Sheet.vue';
import EmptyState from '../components/EmptyState.vue';
import WeatherSettings from '../components/WeatherSettings.vue';
const app = useApp(),
  data = ref<any>(),
  tab = ref('水域档案'),
  error = ref(''),
  busy = ref(false),
  waterOpen = ref(false),
  editing = ref(''),
  water = ref<any>({}),
  revokeId = ref(''),
  reason = ref(''),
  notice = ref({ title: '', body: '', kind: 'announcement' }),
  resolveApp = ref<any>(),
  resolveReason = ref(''),
  linkWater = ref('');
const defaultWater = () => ({
  name: '',
  district: '',
  description: '',
  lng: 106.71,
  lat: 26.58,
  entryLng: undefined,
  entryLat: undefined,
  entryNote: '',
  warning: '',
  recommended: false,
  pendingExplore: true,
  seasonTask: false,
});
const numberFields = [
  { key: 'base', label: '有效点亮基础分' },
  { key: 'catchBonus', label: '现场鱼获加分' },
  { key: 'entryBonus', label: '入门亮灯奖励' },
  { key: 'firstBonus', label: '拓荒首亮奖励' },
  { key: 'weeklyBonus', label: '周常任务奖励' },
  { key: 'weeklyTarget', label: '周常不同水域目标' },
  { key: 'titleTarget', label: '初探黔中称号水域数' },
  { key: 'cooldownHours', label: '冷却小时数（关闭时不生效）' },
];
async function load() {
  if (app.user?.role !== 'admin') return;
  error.value = '';
  try {
    data.value = await api('/admin/overview');
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
const route = useRoute();
if (route.query.tab === 'system') tab.value = '系统配置';
watch(() => app.user?.role, load);
watch(
  () => route.query.tab,
  (value) => {
    if (value === 'system') tab.value = '系统配置';
  },
);
async function execute(action: () => Promise<unknown>, text = '已保存') {
  busy.value = true;
  error.value = '';
  try {
    await action();
    await load();
    await app.refresh();
    app.toast(text);
    return true;
  } catch (e) {
    error.value = (e as Error).message;
    return false;
  } finally {
    busy.value = false;
  }
}
function editWater(item?: any) {
  editing.value = item?.id || '';
  water.value = item ? { ...item } : defaultWater();
  waterOpen.value = true;
}
async function saveWater() {
  const body = {
    ...water.value,
    entryLng: water.value.entryLng === '' ? undefined : water.value.entryLng,
    entryLat: water.value.entryLat === '' ? undefined : water.value.entryLat,
  };
  if (
    await execute(() =>
      send(
        '/admin/waters' + (editing.value ? '/' + editing.value : ''),
        body,
        editing.value ? 'PATCH' : 'POST',
      ),
    )
  )
    waterOpen.value = false;
}
async function resolveApplication(action: 'accept' | 'reject' | 'link') {
  if (
    await execute(
      () =>
        send('/admin/applications/' + resolveApp.value.id + '/resolve', {
          action,
          reason: resolveReason.value,
          waterId: linkWater.value || undefined,
        }),
      '申请已处理',
    )
  )
    resolveApp.value = undefined;
}
async function revoke() {
  if (
    await execute(
      () => send('/trips/' + revokeId.value + '/revoke', { reason: reason.value }),
      '记录已撤销，成绩与地图已重算',
    )
  ) {
    revokeId.value = '';
    reason.value = '';
  }
}
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <div class="eyebrow">OPERATIONS WORKSPACE</div>
        <h1>管理<span class="serif-accent">工作台。</span></h1>
        <p>维护真实水域、活动规则与服务配置。</p>
      </div>
      <RouterLink to="/" class="button secondary"><ArrowLeft :size="16" />返回地图</RouterLink>
    </div>
    <EmptyState
      v-if="app.user?.role !== 'admin'"
      title="需要管理员登录"
      description="在项目环境配置 ADMIN_PASSWORD 后，使用管理员入口登录。"
      ><button class="button primary" @click="app.loginOpen = true">登录</button></EmptyState
    ><template v-else-if="data"
      ><div class="inline-notice">
        当前为首版运营工作台：无点亮人工审核；贵州省界校验后续接入。导出与撤销均记录操作日志。
      </div>
      <div class="admin-tabs filter-row">
        <button
          v-for="item in [
            '水域档案',
            '出钓记录',
            '新水域申请',
            '活动规则',
            '系统配置',
            '公告公示',
            '操作日志',
          ]"
          :key="item"
          :class="['filter-chip', { active: tab === item }]"
          @click="tab = item"
        >
          {{ item }}
        </button>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <section v-if="tab === '水域档案'">
        <div class="section-heading">
          <h2>水域档案 · {{ data.waters.length }}</h2>
          <button class="button primary" @click="editWater()"><Plus :size="16" />新增水域</button>
        </div>
        <EmptyState
          v-if="!data.waters.length"
          title="从第一份水域档案开始"
          description="录入真实水域名称、位置和公开入口，不生成虚假点亮。"
        />
        <div v-for="item in data.waters" :key="item.id" class="admin-row">
          <div>
            <strong>{{ item.name }}</strong
            ><small
              >{{ item.district }} · {{ item.active ? '有效' : '已归档' }} ·
              {{ item.recommended ? '推荐' : '' }}</small
            >
          </div>
          <button class="button secondary small-button" @click="editWater(item)">编辑</button>
        </div>
      </section>
      <section v-if="tab === '出钓记录'">
        <div class="section-heading">
          <h2>出钓记录</h2>
          <a href="/api/admin/export" class="button secondary" download><Download :size="16" />导出成绩</a>
        </div>
        <EmptyState v-if="!data.trips.length" title="暂无出钓记录" description="钓友保存后将在这里显示。" />
        <div v-for="trip in data.trips" :key="trip.id" class="admin-row">
          <div>
            <strong>{{ trip.nickname }} · {{ trip.waterName }}</strong
            ><small
              >{{ dateText(trip.createdAt) }} ·
              {{ trip.revoked ? '已撤销' : trip.light ? '已点亮' : '私人记录' }}</small
            >
          </div>
          <button v-if="!trip.revoked" class="text-button danger" @click="revokeId = trip.id">撤销</button>
        </div>
      </section>
      <section v-if="tab === '新水域申请'">
        <EmptyState
          v-if="!data.applications.length"
          title="暂无新水域申请"
          description="用户可在素材库提交水域名称和位置。"
        />
        <div v-for="item in data.applications" :key="item.id" class="admin-row">
          <div>
            <strong>{{ item.name }} · {{ item.district }}</strong
            ><small>{{ item.note }} · {{ item.location.lng }}, {{ item.location.lat }}</small
            ><small
              >{{ item.status === 'pending' ? '待处理' : item.status === 'accepted' ? '已采纳' : '未采纳' }}
              {{ item.reason }}</small
            >
          </div>
          <button
            v-if="item.status === 'pending'"
            class="button secondary"
            @click="
              resolveApp = item;
              resolveReason = '';
              linkWater = '';
            "
          >
            处理
          </button>
        </div>
      </section>
      <form
        v-if="tab === '活动规则'"
        class="admin-form stack"
        @submit.prevent="execute(() => send('/admin/season', data.season, 'PATCH'))"
      >
        <div class="section-heading">
          <h2>第一季规则</h2>
          <span class="badge neutral">积分参数为可确认草案</span>
        </div>
        <label class="field">活动名称<input v-model="data.season.name" required /></label>
        <div class="field-grid">
          <label class="field">开始时间（含时区 ISO）<input v-model="data.season.startAt" required /></label
          ><label class="field">结束时间（含时区 ISO）<input v-model="data.season.endAt" required /></label>
        </div>
        <label class="check-row"
          ><input v-model="data.season.rules.enabled" type="checkbox" />确认并启用计分规则</label
        >
        <div class="field-grid">
          <label v-for="field in numberFields" :key="field.key" class="field"
            >{{ field.label
            }}<input
              v-model.number="data.season.rules[field.key]"
              type="number"
              :min="['weeklyTarget', 'titleTarget', 'cooldownHours'].includes(field.key) ? 1 : 0"
              :max="
                field.key === 'cooldownHours'
                  ? 720
                  : ['weeklyTarget', 'titleTarget'].includes(field.key)
                    ? 100
                    : 1000
              "
              required
          /></label>
        </div>
        <label class="check-row"
          ><input
            v-model="data.season.rules.cooldownEnabled"
            type="checkbox"
          />开启同人同水域冷却（默认关闭）</label
        ><label class="field"
          >规则公示文本<textarea v-model="data.season.rulesText" rows="4" maxlength="5000" /></label
        ><label class="field"
          >礼物与领取说明<textarea v-model="data.season.rewardDescription" rows="3" maxlength="3000" />
        </label>
        <p class="small muted">新记录保存规则快照，修改分值不追改既有记录；已有赛季记录后锁定起止时间。</p>
        <button class="button primary" :disabled="busy"><Save :size="16" />保存活动规则</button>
      </form>
      <form
        v-if="tab === '系统配置'"
        class="admin-form stack"
        @submit.prevent="execute(() => send('/admin/config', data.config, 'PATCH'))"
      >
        <h2>地图与热度</h2>
        <label class="field"
          >高德 JS API Key<input
            v-model="data.config.amapKey"
            autocomplete="off"
            placeholder="暂不配置也可运行其他功能" /></label
        ><label class="field"
          >高德 JS 安全码<input v-model="data.config.amapSecurityCode" type="password" autocomplete="off"
        /></label>
        <p class="small muted">
          浏览器地图配置会下发前端，请在高德控制台限制域名。服务端 Key
          与天气密钥仅配置在环境变量，后台不读取或展示。
        </p>
        <div class="field-grid">
          <label class="field"
            >近期统计天数<input
              v-model.number="data.config.heatDays"
              type="number"
              min="1"
              max="365"
              required /></label
          ><label class="field"
            >近期持续不同钓友数<input
              v-model.number="data.config.recentVisitors"
              type="number"
              min="1"
              max="999"
              required /></label
          ><label class="field"
            >近期火热不同钓友数<input
              v-model.number="data.config.hotVisitors"
              type="number"
              min="2"
              max="1000"
              required
          /></label>
        </div>
        <div class="inline-notice">天气服务可在下方独立配置，保存后即时生效。贵州区域限制尚未启用。</div>
        <button class="button primary" :disabled="busy"><Save :size="16" />保存系统配置</button>
      </form>
      <WeatherSettings v-if="tab === '系统配置'" />
      <section v-if="tab === '公告公示'">
        <form
          class="admin-form stack"
          @submit.prevent="execute(() => send('/admin/notices', notice), '公告已发布')"
        >
          <label class="field"
            >公告类型<select v-model="notice.kind">
              <option value="announcement">活动公告</option>
              <option value="results">成绩公示</option>
              <option value="awards">获奖名单</option>
            </select></label
          ><label class="field"
            >标题<input v-model="notice.title" required minlength="2" maxlength="100" /></label
          ><label class="field"
            >正文<textarea v-model="notice.body" required minlength="2" maxlength="5000" rows="5" /></label
          ><button class="button primary" :disabled="busy">发布公示</button>
        </form>
        <div v-for="item in data.notices" :key="item.id" class="admin-row">
          <div>
            <strong>{{ item.title }}</strong
            ><small>{{ dateText(item.createdAt) }}</small>
          </div>
        </div>
      </section>
      <section v-if="tab === '操作日志'">
        <div class="section-heading">
          <h2>最近 100 条日志</h2>
          <button class="text-button" @click="load"><RefreshCw :size="16" />刷新</button>
        </div>
        <div v-for="item in data.audit" :key="item.id" class="admin-row">
          <div>
            <strong>{{ item.action }}</strong
            ><small>{{ item.reason }}</small
            ><small>{{ dateText(item.createdAt) }} · {{ item.targetId }}</small>
          </div>
        </div>
      </section>
    </template>
  </section>
  <Sheet :open="waterOpen" :title="editing ? '编辑水域' : '新增真实水域'" @close="waterOpen = false"
    ><form class="stack" @submit.prevent="saveWater">
      <label class="field">水域名称<input v-model="water.name" required minlength="2" maxlength="80" /></label
      ><label class="field">所属地区<input v-model="water.district" required maxlength="80" /></label>
      <div class="field-grid">
        <label class="field"
          >水域经度（WGS84）<input
            v-model.number="water.lng"
            type="number"
            step="any"
            min="-180"
            max="180"
            required /></label
        ><label class="field"
          >水域纬度（WGS84）<input
            v-model.number="water.lat"
            type="number"
            step="any"
            min="-90"
            max="90"
            required
        /></label>
      </div>
      <label class="field">简介<textarea v-model="water.description" maxlength="2000" rows="2" /></label>
      <div class="field-grid">
        <label class="field"
          >公开入口经度<input
            v-model.number="water.entryLng"
            type="number"
            step="any"
            min="-180"
            max="180" /></label
        ><label class="field"
          >公开入口纬度<input v-model.number="water.entryLat" type="number" step="any" min="-90" max="90"
        /></label>
      </div>
      <label class="field">到达说明<textarea v-model="water.entryNote" maxlength="1000" rows="2" /></label
      ><label class="field"
        >禁钓 / 水源 / 通行提醒<textarea v-model="water.warning" maxlength="1000" rows="2" />
      </label>
      <div class="check-group">
        <label><input v-model="water.recommended" type="checkbox" />管理员推荐</label
        ><label><input v-model="water.pendingExplore" type="checkbox" />待探</label
        ><label><input v-model="water.seasonTask" type="checkbox" />本季任务水域</label>
      </div>
      <p v-if="error" role="alert" class="error-text">{{ error }}</p>
      <button class="button primary" :disabled="busy">保存水域</button>
    </form></Sheet
  >
  <Sheet :open="!!revokeId" title="撤销记录及对应活动贡献" @close="revokeId = ''"
    ><form class="stack" @submit.prevent="revoke">
      <p>逻辑撤销记录，取消公开，并重算点亮、积分、任务、称号和榜单，保留日志。</p>
      <label class="field"
        >原因<textarea v-model="reason" required minlength="2" maxlength="500" rows="3" />
      </label>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="button primary" :disabled="busy">确认撤销</button>
    </form></Sheet
  >
  <Sheet :open="!!resolveApp" title="处理新水域申请" @close="resolveApp = undefined"
    ><div v-if="resolveApp" class="stack">
      <h3>{{ resolveApp.name }}</h3>
      <p>{{ resolveApp.note }}</p>
      <label class="field"
        >处理说明<textarea
          v-model="resolveReason"
          maxlength="500"
          rows="3"
          placeholder="未采纳时必填原因"
        /></label
      ><button class="button primary" :disabled="busy" @click="resolveApplication('accept')">
        采纳为新水域</button
      ><label class="field"
        >或关联已有水域<select v-model="linkWater">
          <option value="">请选择已有水域</option>
          <option v-for="item in data.waters.filter((w: any) => w.active)" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select></label
      ><button class="button secondary" :disabled="!linkWater || busy" @click="resolveApplication('link')">
        关联已有水域</button
      ><button class="text-button danger" :disabled="busy" @click="resolveApplication('reject')">
        不采纳申请
      </button>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div></Sheet
  >
</template>
