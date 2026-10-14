import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Season, User, WaterView } from '../../../../packages/shared/src/index';
import { api, send } from '../lib/api';
type Bootstrap = {
  season: Season;
  config: { amapKey: string; amapSecurityCode: string };
  capabilities: { regionRestriction: boolean; map: boolean; weather: boolean; login: string };
  serverTime: string;
};
export const useApp = defineStore('app', () => {
  const user = ref<User | null>(null),
    boot = ref<Bootstrap | null>(null),
    waters = ref<WaterView[]>([]),
    ready = ref(false),
    error = ref(''),
    loginOpen = ref(false),
    devAuth = ref(false),
    adminEnabled = ref(false),
    message = ref('');
  let timer: ReturnType<typeof setTimeout>;
  function toast(text: string) {
    message.value = text;
    clearTimeout(timer);
    timer = setTimeout(() => (message.value = ''), 6000);
  }
  async function refresh() {
    const [bootstrap, auth, items] = await Promise.all([
      api<Bootstrap>('/bootstrap'),
      api<{ user: User | null; devAuth: boolean; adminEnabled: boolean }>('/auth/me'),
      api<WaterView[]>('/waters'),
    ]);
    boot.value = bootstrap;
    user.value = auth.user;
    devAuth.value = auth.devAuth;
    adminEnabled.value = auth.adminEnabled;
    waters.value = items;
  }
  async function initialize() {
    error.value = '';
    try {
      await refresh();
      ready.value = true;
    } catch (e) {
      error.value = (e as Error).message;
    }
  }
  function requireLogin() {
    if (user.value) return true;
    loginOpen.value = true;
    return false;
  }
  async function login(nickname: string, password?: string) {
    await send('/auth/login', { nickname, password: password || undefined });
    await refresh();
    loginOpen.value = false;
    toast(password ? '已进入管理工作台' : '已登录开发体验账号');
  }
  async function logout() {
    await send('/auth/logout', {});
    user.value = null;
    await refresh();
    toast('已退出登录');
  }
  return {
    user,
    boot,
    waters,
    ready,
    error,
    loginOpen,
    devAuth,
    adminEnabled,
    message,
    toast,
    refresh,
    initialize,
    requireLogin,
    login,
    logout,
  };
});
