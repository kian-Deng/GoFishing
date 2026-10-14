<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import {
  Fish,
  Map,
  Plus,
  Flag,
  Images,
  ArrowUpRight,
  Settings2,
  LogOut,
  Waves,
  ChevronRight,
} from '@lucide/vue';
import { useApp } from './stores/app';
import Sheet from './components/Sheet.vue';
const app = useApp(),
  route = useRoute(),
  nickname = ref(''),
  password = ref(''),
  adminMode = ref(false),
  busy = ref(false),
  loginError = ref('');
const links = [
  { path: '/', label: '找钓位', icon: Map },
  { path: '/record', label: '我要点亮', icon: Plus },
  { path: '/activity', label: '活动看板', icon: Flag },
  { path: '/library', label: '我的素材', icon: Images },
];
onMounted(() => app.initialize());
watch(
  () => app.loginOpen,
  (open) => {
    if (open) {
      adminMode.value = route.path === '/admin';
      loginError.value = '';
    }
  },
);
async function login() {
  busy.value = true;
  loginError.value = '';
  try {
    await app.login(
      adminMode.value ? '管理员' : nickname.value,
      adminMode.value ? password.value : undefined,
    );
    password.value = '';
  } catch (e) {
    loginError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-icon"><Fish :size="29" /></span
        ><span>钓鱼真探<small>GO FISHING · GUIZHOU</small></span></RouterLink
      >
      <div class="sidebar-section">出发，去发现</div>
      <nav class="side-nav">
        <RouterLink
          v-for="link in links"
          :key="link.path"
          :to="link.path"
          :class="{ selected: route.path === link.path }"
          ><component :is="link.icon" :size="20" />{{ link.label
          }}<ChevronRight v-if="route.path === link.path" :size="15" class="nav-arrow"
        /></RouterLink>
      </nav>
      <RouterLink to="/activity" class="season-aside"
        ><span class="eyebrow">SEASON 01</span><Waves :size="32" />
        <h3>点亮黔中水</h3>
        <p>让每一次出钓<br />成为值得留下的发现。</p>
        <span>探索第一季 <ArrowUpRight :size="16" /></span
      ></RouterLink>
      <div class="side-bottom">
        <span class="status-dot" />贵州 · 第一季<br /><small>真实出钓，留下自己的故事</small>
      </div>
    </aside>
    <div class="main-shell">
      <header class="app-header">
        <RouterLink to="/" class="mobile-brand"><Fish :size="23" />钓鱼真探</RouterLink
        ><span class="header-context"
          ><span class="status-dot" />点亮黔中水 <span class="divider">/</span> 第一季</span
        >
        <div class="header-actions">
          <RouterLink to="/admin?tab=system" class="icon-button" aria-label="地图与天气配置"
            ><Settings2 :size="19" /></RouterLink
          ><button v-if="!app.user" class="profile-button" @click="app.loginOpen = true">
            登录 / 开始记录 <ArrowUpRight :size="15" /></button
          ><template v-else
            ><span class="avatar">{{ app.user.nickname.slice(0, 1) }}</span
            ><span class="profile-name">{{ app.user.nickname }}</span
            ><button
              class="icon-button"
              aria-label="退出登录"
              @click="app.logout().catch((e) => app.toast(e.message))"
            >
              <LogOut :size="17" /></button
          ></template>
        </div>
      </header>
      <div v-if="app.error" class="startup-error">
        <h2>暂时无法连接服务</h2>
        <p>{{ app.error }}</p>
        <button class="button primary" @click="app.initialize">重新连接</button>
      </div>
      <main v-else-if="app.ready" class="page-content">
        <RouterView v-slot="{ Component }"
          ><KeepAlive :max="4" :include="['MapView', 'RecordView']"><component :is="Component" /></KeepAlive
        ></RouterView>
      </main>
      <div v-else class="startup-error">正在准备你的探索地图…</div>
      <footer class="page-footer">
        <span>钓鱼真探 · 每次出发，都有发现</span><span>贵州区域限制暂未启用</span>
      </footer>
    </div>
    <nav class="bottom-nav" aria-label="主功能">
      <RouterLink
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        :class="{ selected: route.path === link.path }"
        ><component :is="link.icon" :size="21" /><span>{{ link.label }}</span></RouterLink
      >
    </nav>
  </div>
  <Sheet :open="app.loginOpen" title="把这次出钓留下来" @close="app.loginOpen = false"
    ><form @submit.prevent="login" class="stack">
      <p class="muted">登录后保存素材、点亮水域，查看自己的探索足迹。</p>
      <div v-if="app.devAuth && !adminMode" class="inline-notice">
        当前为本地开发体验登录，不验证手机号或微信身份；会话丢失后无法找回同一体验账号。
      </div>
      <label v-if="!adminMode" class="field"
        >你的昵称<input
          v-model="nickname"
          required
          minlength="2"
          maxlength="20"
          placeholder="给自己取个钓友昵称"
          autocomplete="nickname" /></label
      ><label v-else class="field"
        >管理员密码<input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          placeholder="部署时设置的管理员密码"
      /></label>
      <div v-if="adminMode && !app.adminEnabled" class="inline-notice">
        管理员登录未启用。请在项目根目录 .env 设置至少 12 位 ADMIN_PASSWORD，再重启后端。
      </div>
      <p v-if="loginError" role="alert" class="error-text">{{ loginError }}</p>
      <button
        class="button primary full"
        :disabled="busy || (adminMode && !app.adminEnabled) || (!adminMode && !app.devAuth)"
      >
        {{
          busy ? '正在登录…' : adminMode ? '进入管理工作台' : app.devAuth ? '开始体验' : '正式登录服务待配置'
        }}</button
      ><button
        type="button"
        class="text-button"
        @click="
          adminMode = !adminMode;
          loginError = '';
        "
      >
        {{ adminMode ? '返回钓友登录' : '管理员登录' }}
      </button>
    </form></Sheet
  >
  <Transition name="toast"
    ><div v-if="app.message" class="toast" role="status">{{ app.message }}</div></Transition
  >
</template>
