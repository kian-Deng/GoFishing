<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { RouterLink } from 'vue-router';
import {
  ArrowUpRight,
  Flag,
  Sparkles,
  Compass,
  Trophy,
  Gift,
  ChevronRight,
  Check,
  RefreshCw,
} from '@lucide/vue';
import { useApp } from '../stores/app';
import { api, dateText, dayText } from '../lib/api';
import EmptyState from '../components/EmptyState.vue';
import Sheet from '../components/Sheet.vue';
const app = useApp(),
  data = ref<any>(),
  error = ref(''),
  board = ref<'points' | 'waters' | 'first'>('points'),
  details = ref<'rules' | 'ledger' | 'reward' | null>(null),
  notice = ref<any>();
async function load() {
  error.value = '';
  try {
    data.value = await api('/activity');
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
const phaseLabel = computed(
  () =>
    ({ upcoming: '即将开始', active: '探索进行中', ended: '本季已结束' })[data.value?.phase as string] || '',
);
const tasks = computed(() =>
  data.value
    ? [
        {
          name: '入门亮灯',
          description: '本季完成首次有效点亮',
          done: data.value.mine.waters > 0,
          progress: Math.min(1, data.value.mine.waters),
          target: 1,
          points: data.value.season.rules.entryBonus,
          icon: Flag,
        },
        {
          name: '周常探图',
          description: '本周点亮不同水域，每周一重置',
          done: data.value.mine.weekWaters >= data.value.season.rules.weeklyTarget,
          progress: data.value.mine.weekWaters,
          target: data.value.season.rules.weeklyTarget,
          points: data.value.season.rules.weeklyBonus,
          icon: Compass,
        },
        {
          name: '拓荒首亮',
          description: '成为尚未点亮水域的首位探索者',
          done: data.value.mine.first > 0,
          progress: data.value.mine.first,
          target: 1,
          points: data.value.season.rules.firstBonus,
          icon: Sparkles,
        },
      ]
    : [],
);
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <div class="eyebrow">SEASON 01 · GUIZHOU</div>
        <h1>点亮<span class="serif-accent">黔中水。</span></h1>
        <p>你的每次真实出钓，都在为这张地图写下新的注脚。</p>
      </div>
      <button class="icon-button" aria-label="刷新活动成绩" @click="load"><RefreshCw :size="19" /></button>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <template v-if="data"
      ><div class="activity-banner">
        <div>
          <span class="season-mark">{{ phaseLabel }}</span>
          <h2>从一盏灯，到一片水。</h2>
          <p>{{ dayText(data.season.startAt) }} — {{ dayText(data.season.endAt) }} · 第一季贵州主题</p>
          <button class="banner-link" @click="details = 'rules'">活动规则 <ArrowUpRight :size="16" /></button>
        </div>
        <div class="activity-emblem">
          <div class="wave-art" aria-hidden="true"><span /><span /><span /></div>
          <span>黔中 · 探索季</span>
        </div>
      </div>
      <div v-if="!data.season.rules.enabled" class="inline-notice space-top">
        计分方案尚未启用。下方分值为待确认配置，普通点亮和素材保存不受影响。
      </div>
      <div class="section-heading">
        <h2>我的赛季</h2>
        <button class="text-button" @click="app.requireLogin() && (details = 'ledger')">
          积分明细 <ChevronRight :size="15" />
        </button>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <span>本季贡献积分</span><strong>{{ data.mine.points }}<small>分</small></strong
          ><span class="small">{{ app.user ? '来自有效活动记录' : '登录后查看自己的成绩' }}</span>
        </div>
        <div class="stat-card">
          <span>已点亮水域</span><strong>{{ data.mine.waters }}<small>处</small></strong
          ><span class="small">不同水域，分别收藏</span>
        </div>
        <div class="stat-card">
          <span>我的排名</span><strong>{{ data.mine.rank || '—' }}</strong
          ><span class="small">积分榜 · 自动更新</span>
        </div>
        <div class="stat-card title-stat">
          <Trophy :size="22" /><strong class="title-name">{{ data.mine.title || '初探黔中' }}</strong
          ><span class="small">{{
            data.mine.title ? '已获得称号' : `目标：点亮 ${data.season.rules.titleTarget} 处本季水域`
          }}</span>
        </div>
      </div>
      <div class="section-heading">
        <h2>带着任务去探索</h2>
        <span class="muted small">完成后奖励自动结算</span>
      </div>
      <div class="task-grid">
        <article v-for="task in tasks" :key="task.name" class="task-card">
          <div class="row">
            <span class="task-icon"><component :is="task.icon" :size="23" /></span
            ><span :class="['badge', task.done ? 'green' : 'neutral']">{{
              data.phase === 'upcoming'
                ? '待开始'
                : task.done
                  ? '已完成'
                  : data.phase === 'ended'
                    ? '已结束'
                    : '探索中'
            }}</span>
          </div>
          <h3>{{ task.name }}</h3>
          <p>{{ task.description }}</p>
          <div class="task-progress">
            <span :style="{ width: Math.min(100, (task.progress / task.target) * 100) + '%' }" />
          </div>
          <div class="row small">
            <span>{{ Math.min(task.progress, task.target) }} / {{ task.target }}</span
            ><span>{{ data.season.rules.enabled ? '+' : '待确认 +' }}{{ task.points }} 分</span>
          </div>
          <RouterLink :to="task.name === '拓荒首亮' ? '/?layer=待探水域' : '/record'" class="text-button"
            >{{ task.done ? '继续探索' : '去点亮' }} <ArrowUpRight :size="15"
          /></RouterLink>
        </article>
      </div>
      <div class="activity-bottom">
        <section class="board-panel">
          <div class="section-heading">
            <h2>本季三榜</h2>
            <Trophy :size="20" />
          </div>
          <div class="segmented">
            <button
              v-for="item in [
                { id: 'points', name: '积分榜' },
                { id: 'waters', name: '探水榜' },
                { id: 'first', name: '拓荒榜' },
              ]"
              :key="item.id"
              :class="{ active: board === item.id }"
              @click="board = item.id as typeof board"
            >
              {{ item.name }}
            </button>
          </div>
          <EmptyState
            v-if="!data.boards[board].length"
            title="第一位探索者，会是你吗？"
            :description="
              data.phase === 'upcoming' ? '活动尚未开始，榜单静候第一盏灯。' : '暂无符合该榜单条件的记录。'
            "
          />
          <ol v-else class="rank-list">
            <li v-for="row in data.boards[board]" :key="row.userId">
              <span class="rank-number">{{ row.rank }}</span
              ><span class="avatar">{{ row.nickname.slice(0, 1) }}</span
              ><strong>{{ row.nickname }}<small v-if="row.userId === app.user?.id"> 我</small></strong
              ><span class="spacer" /><span>{{ row[board] }}{{ board === 'points' ? ' 分' : ' 处' }}</span>
            </li>
          </ol>
          <p class="small muted">更新时间 {{ dateText(data.serverTime) }} · 同分按稳定用户编号排序</p>
        </section>
        <aside>
          <section class="reward-card">
            <Gift :size="25" />
            <h3>探索的礼物</h3>
            <p>{{ data.season.rewardDescription }}</p>
            <button class="text-button" @click="details = 'reward'">
              奖励与领取说明 <ArrowUpRight :size="15" />
            </button>
          </section>
          <div class="section-heading">
            <h3>公示中心</h3>
            <span class="count-badge">{{ data.notices.length }}</span>
          </div>
          <p v-if="!data.notices.length" class="muted small">暂无公告。活动消息与获奖名单将在这里发布。</p>
          <button v-for="item in data.notices" :key="item.id" class="notice-item" @click="notice = item">
            <span
              >{{ item.title }}<small>{{ dayText(item.createdAt) }}</small></span
            ><ChevronRight :size="16" />
          </button>
        </aside></div
    ></template>
  </section>
  <Sheet
    :open="!!details"
    :title="details === 'rules' ? '第一季活动规则' : details === 'ledger' ? '我的积分明细' : '奖励与领取说明'"
    @close="details = null"
    ><template v-if="data"
      ><div v-if="details === 'rules'" class="prose">
        <p>{{ data.season.rulesText }}</p>
        <p>当前贵州省界限制暂未启用。点亮影响半径 2 公里用于内部核算，公共地图只展示水域汇总。</p>
        <p>
          同人同水域冷却：{{
            data.season.rules.cooldownEnabled ? '已启用' : '关闭'
          }}。重复图片不可重复用于点亮。
        </p>
        <p>原始照片仅作个人素材下载，不在公共接口返回精确坐标。</p>
      </div>
      <div v-else-if="details === 'ledger'">
        <EmptyState
          v-if="!data.ledger.length"
          title="还没有积分记录"
          description="活动进行中且计分启用后，有效记录会自动结算。"
        />
        <div v-for="entry in data.ledger" :key="entry.id" class="ledger-row">
          <span>{{ entry.description }}</span
          ><strong>+{{ entry.points }}</strong>
        </div>
        <p class="small muted">记录撤销后重新计算有效成绩，操作保留日志。</p>
      </div>
      <div v-else class="prose">
        <p>{{ data.season.rewardDescription }}</p>
        <p>称号：本季点亮 {{ data.season.rules.titleTarget }} 个不同水域可获得「初探黔中」。</p>
        <p>实物奖励以公示内容为准，当前版本由运营线下登记发放。</p>
      </div></template
    ></Sheet
  ><Sheet :open="!!notice" :title="notice?.title || '活动公告'" @close="notice = undefined"
    ><p class="prose">{{ notice?.body }}</p></Sheet
  >
</template>
