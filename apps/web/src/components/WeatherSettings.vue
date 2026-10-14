<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { CloudSun, Save, PlugZap } from '@lucide/vue';
import { api, send } from '../lib/api';
import { useApp } from '../stores/app';
const app = useApp(),
  settings = ref({ provider: 'disabled', host: '', hasKey: false, source: 'environment', ready: false }),
  apiKey = ref(''),
  clearKey = ref(false),
  busy = ref(false),
  error = ref(''),
  testMessage = ref('');
async function load() {
  try {
    settings.value = await api('/admin/weather');
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
async function save() {
  error.value = '';
  testMessage.value = '';
  busy.value = true;
  try {
    settings.value = await send(
      '/admin/weather',
      {
        provider: settings.value.provider,
        host: settings.value.host,
        apiKey: apiKey.value || undefined,
        clearKey: clearKey.value,
      },
      'PATCH',
    );
    apiKey.value = '';
    clearKey.value = false;
    await app.refresh();
    app.toast('天气配置已保存，立即生效');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function test() {
  busy.value = true;
  testMessage.value = '';
  try {
    const response = await send<{
      message: string;
      result: { status: string; text?: string; temperature?: string };
    }>('/admin/weather/test', {});
    testMessage.value =
      response.message +
      (response.result.status === 'available'
        ? ` · ${response.result.text} ${response.result.temperature}℃`
        : '');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <form class="admin-form stack space-top" @submit.prevent="save">
    <div class="row">
      <h2 style="margin: 0"><CloudSun :size="20" /> 气象服务配置</h2>
      <span :class="['badge', settings.ready ? 'green' : 'neutral']">{{
        settings.ready ? '已配置' : '未启用'
      }}</span>
    </div>
    <p class="muted small">保存后立即作用于新出钓记录，无需重启。密钥加密保存，重新打开页面不会返回原文。</p>
    <label class="field"
      >天气服务<select v-model="settings.provider">
        <option value="disabled">暂不启用</option>
        <option value="qweather">和风天气</option>
      </select></label
    ><label class="field"
      >API Host<input
        v-model="settings.host"
        maxlength="200"
        placeholder="控制台分配的 xxx.qweatherapi.com，不带 https://"
        autocomplete="off" /></label
    ><label class="field"
      >API Key<input
        v-model="apiKey"
        type="password"
        maxlength="1000"
        :placeholder="settings.hasKey ? '已保存密钥；留空保留，填写则替换' : '填写天气服务 API Key'"
        autocomplete="new-password" /></label
    ><label v-if="settings.hasKey" class="check-row"
      ><input v-model="clearKey" type="checkbox" />清除已保存密钥（需同时停用天气）</label
    >
    <p class="small muted">
      当前配置来源：{{
        settings.source === 'admin' ? '管理工作台' : '环境变量'
      }}。测试使用贵阳公共参考坐标，不读取你的设备位置。
    </p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div v-if="testMessage" class="inline-notice" role="status">{{ testMessage }}</div>
    <div class="action-row">
      <button class="button primary" :disabled="busy">
        <Save :size="16" />{{ busy ? '处理中…' : '保存天气配置' }}</button
      ><button type="button" class="button secondary" :disabled="busy || !settings.ready" @click="test">
        <PlugZap :size="16" />测试已保存配置
      </button>
    </div>
  </form>
</template>
