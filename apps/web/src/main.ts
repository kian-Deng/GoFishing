import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './styles.css';
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/MapView.vue'), meta: { title: '找钓位' } },
    { path: '/record', component: () => import('./views/RecordView.vue'), meta: { title: '我要点亮' } },
    { path: '/activity', component: () => import('./views/ActivityView.vue'), meta: { title: '活动看板' } },
    { path: '/library', component: () => import('./views/LibraryView.vue'), meta: { title: '我的素材' } },
    { path: '/admin', component: () => import('./views/AdminView.vue'), meta: { title: '管理工作台' } },
    { path: '/share/:id', component: () => import('./views/ShareView.vue'), meta: { title: '出钓分享' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
router.afterEach((to) => {
  document.title = `${String(to.meta.title || '钓鱼真探')} · 钓鱼真探`;
});
createApp(App).use(createPinia()).use(router).mount('#app');
