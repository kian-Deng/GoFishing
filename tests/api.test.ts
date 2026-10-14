import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import sharp from 'sharp';

let child: ChildProcess,
  base = '',
  adminCookie = '',
  cookie = '',
  waterId = '',
  assetId = '',
  tripId = '',
  output = '';
const testDirectory = resolve('data', 'api-test-' + randomUUID());
async function call(path: string, body?: unknown, session = '', method = body ? 'POST' : 'GET') {
  const headers: Record<string, string> = {};
  if (session) headers.Cookie = session;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { response, data, cookie: response.headers.getSetCookie()?.[0]?.split(';')[0] || '' };
}
async function upload(
  source: 'camera' | 'album',
  rgb: { r: number; g: number; b: number },
  session = cookie,
) {
  const form = new FormData();
  form.append(
    'photos',
    new Blob(
      [
        new Uint8Array(
          await sharp({ create: { width: 32, height: 32, channels: 3, background: rgb } })
            .jpeg()
            .toBuffer(),
        ),
      ],
      { type: 'image/jpeg' },
    ),
    'test.jpg',
  );
  form.append('kind', 'environment');
  form.append('source', source);
  if (source === 'camera') {
    const capture = await call('/media/capture', { kind: 'environment' }, session);
    form.append('token', capture.data.token);
  }
  const response = await fetch(base + '/media/upload', {
    method: 'POST',
    body: form,
    headers: { Cookie: session },
  });
  expect(response.status).toBe(201);
  return (await response.json()).id as string;
}
beforeAll(async () => {
  await mkdir(testDirectory, { recursive: true });
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  base = `http://127.0.0.1:${port}/api`;
  child = spawn(process.execPath, ['apps/api/dist/apps/api/src/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DEV_AUTH: 'true',
      ADMIN_PASSWORD: 'test-only-password-12345',
      DATA_DRIVER: 'file',
      DATA_DIR: testDirectory,
      UPLOAD_DIR: resolve(testDirectory, 'uploads'),
      WEATHER_PROVIDER: 'disabled',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => (output += String(chunk)));
  child.stderr?.on('data', (chunk) => (output += String(chunk)));
  child.on('error', (error) => (output += error.message));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/health');
      if (r.ok) return;
    } catch {}
    if (child.exitCode !== null) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API 启动超时：' + output);
});
afterAll(async () => {
  if (child && child.exitCode === null) {
    const done = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    await done;
  }
  const target = resolve(testDirectory);
  if (
    target.startsWith(resolve('data') + String.raw`\api-test-`) ||
    target.startsWith(resolve('data') + '/api-test-')
  )
    await rm(target, { recursive: true, force: true });
});
describe('实际 HTTP 业务闭环', () => {
  it('首次启动没有虚假数据，贵州限制关闭', async () => {
    const { data } = await call('/health');
    expect(data.regionRestriction).toBe(false);
    expect((await call('/waters')).data).toEqual([]);
    expect((await call('/activity')).data.boards.points).toEqual([]);
  });
  it('匿名不能上传私密素材或访问管理接口', async () => {
    expect((await call('/trips')).response.status).toBe(401);
    expect((await call('/admin/overview')).response.status).toBe(401);
  });
  it('开发账号不能取得管理员权限', async () => {
    const result = await call('/auth/login', { nickname: '测试钓友' });
    cookie = result.cookie;
    expect(cookie).toContain('fishing_session=');
    expect((await call('/admin/overview', undefined, cookie)).response.status).toBe(403);
  });
  it('管理员初始化真实水域与启用活动规则', async () => {
    const login = await call('/auth/login', { nickname: '管理员', password: 'test-only-password-12345' });
    adminCookie = login.cookie;
    const water = await call(
      '/admin/waters',
      {
        name: '自动测试水域',
        district: '仅测试，不进入正式数据',
        lng: 106.7,
        lat: 26.6,
        entryNote: '测试入口',
      },
      adminCookie,
    );
    expect(water.response.status).toBe(201);
    waterId = water.data.id;
    const overview = await call('/admin/overview', undefined, adminCookie);
    const season = {
      ...overview.data.season,
      startAt: new Date(Date.now() - 86400_000).toISOString(),
      endAt: new Date(Date.now() + 86400_000).toISOString(),
      rules: { ...overview.data.season.rules, enabled: true },
    };
    expect((await call('/admin/season', season, adminCookie, 'PATCH')).response.status).toBe(200);
  });
  it('现场拍摄上传后，空军可即时点亮，重复提交不会重复加分', async () => {
    assetId = await upload('camera', { r: 20, g: 100, b: 90 });
    tripId = randomUUID();
    const body = {
      requestId: tripId,
      waterId,
      assetIds: [assetId],
      location: {
        lng: 106.7,
        lat: 26.6,
        accuracy: 20,
        capturedAt: new Date().toISOString(),
        system: 'WGS84',
      },
      catchStatus: 'blank',
      fish: [],
      note: '测试记录',
      public: false,
      light: true,
    };
    const first = await call('/trips', body, cookie);
    expect(first.response.status).toBe(201);
    expect(first.data.trip.light).toBe(true);
    expect(first.data.points).toBe(35);
    expect((await call('/trips', body, cookie)).data.replayed).toBe(true);
    const activity = await call('/activity', undefined, cookie);
    expect(activity.data.mine.points).toBe(35);
    expect(activity.data.mine.waters).toBe(1);
    expect((await call('/trips', undefined, cookie)).data).toHaveLength(1);
  });
  it('匿名及其他账号不能读取私人照片', async () => {
    expect((await fetch(base + '/media/' + assetId + '/private')).status).toBe(401);
    expect((await fetch(base + '/media/' + assetId + '/public')).status).toBe(400);
    const stranger = await call('/auth/login', { nickname: '另一个账号' });
    expect(
      (await fetch(base + '/media/' + assetId + '/original', { headers: { Cookie: stranger.cookie } }))
        .status,
    ).toBe(400);
    const original = await fetch(base + '/media/' + assetId + '/original', { headers: { Cookie: cookie } });
    expect(original.status).toBe(200);
    expect(original.headers.get('content-disposition')).toContain('attachment');
  });
  it('分享只公开脱敏记录与缩略图', async () => {
    expect(
      (await call('/trips/' + tripId + '/visibility', { public: true }, cookie, 'PATCH')).response.status,
    ).toBe(200);
    const { data } = await call('/share/' + tripId);
    expect(data).not.toHaveProperty('location');
    expect(data).not.toHaveProperty('assetIds');
    expect((await fetch(base + '/media/' + assetId + '/public')).status).toBe(200);
    expect((await fetch(base + '/media/' + assetId + '/original')).status).toBe(401);
  });
  it('相同图片不能用于第二次点亮', async () => {
    const body = {
      requestId: randomUUID(),
      waterId,
      assetIds: [assetId],
      location: {
        lng: 106.7,
        lat: 26.6,
        accuracy: 20,
        capturedAt: new Date().toISOString(),
        system: 'WGS84',
      },
      catchStatus: 'blank',
      fish: [],
      note: '重复图片',
      public: false,
      light: true,
    };
    const { response, data } = await call('/trips', body, cookie);
    expect(response.status).toBe(400);
    expect(data.message).toContain('已经用于点亮');
  });
  it('相册素材可私人保存，但不能直接作为点亮证据', async () => {
    const albumId = await upload('album', { r: 220, g: 100, b: 20 });
    const body = {
      requestId: randomUUID(),
      waterId,
      assetIds: [albumId],
      catchStatus: 'blank',
      fish: [],
      note: '相册私人素材',
      public: false,
      light: false,
    };
    expect((await call('/trips', body, cookie)).response.status).toBe(201);
    const attempt = await call(
      '/trips',
      {
        ...body,
        light: true,
        location: {
          lng: 106.7,
          lat: 26.6,
          accuracy: 20,
          capturedAt: new Date().toISOString(),
          system: 'WGS84',
        },
      },
      cookie,
    );
    expect(attempt.response.status).toBe(400);
    expect(attempt.data.message).toContain('现场拍摄环境照片');
  });
  it('管理员撤销后积分、榜单、点亮回退，私人素材仍能查看', async () => {
    const result = await call('/trips/' + tripId + '/revoke', { reason: '自动测试撤销' }, adminCookie);
    expect(result.response.status).toBe(201);
    expect(result.data.removedPoints).toBe(35);
    const activity = (await call('/activity', undefined, cookie)).data;
    expect(activity.mine.points).toBe(0);
    expect(activity.boards.points).toEqual([]);
    expect((await call('/waters')).data[0].lit).toBe(false);
    expect((await fetch(base + '/media/' + assetId + '/public')).status).toBe(400);
    expect(
      (await fetch(base + '/media/' + assetId + '/private', { headers: { Cookie: cookie } })).status,
    ).toBe(200);
    const overview = (await call('/admin/overview', undefined, adminCookie)).data;
    expect(overview.audit.some((entry: any) => entry.action === 'trip.revoke')).toBe(true);
  });
  it('未配置天气不阻塞私人素材保存，公开入口不必强填', async () => {
    const trips = (await call('/trips', undefined, cookie)).data;
    expect(trips.every((t: any) => t.weather.status === 'disabled')).toBe(true);
    expect((await call('/waters')).data[0].entryLng).toBeUndefined();
  });
  it('跨站写入被拒绝', async () => {
    const response = await fetch(base + '/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://example.invalid', Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });
  it('天气管理仅管理员可用，密钥加密持久化且不回显', async () => {
    expect((await call('/admin/weather', undefined, cookie)).response.status).toBe(403);
    const result = await call(
      '/admin/weather',
      {
        provider: 'qweather',
        host: 'test.qweatherapi.com',
        apiKey: 'test-only-weather-secret',
      },
      adminCookie,
      'PATCH',
    );
    expect(result.response.status).toBe(200);
    expect(result.data.hasKey).toBe(true);
    expect(result.data.ready).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('test-only-weather-secret');
    expect(await readFile(resolve(testDirectory, 'state.json'), 'utf8')).not.toContain(
      'test-only-weather-secret',
    );
    expect((await call('/bootstrap')).data.capabilities.weather).toBe(true);
    const kept = await call(
      '/admin/weather',
      { provider: 'qweather', host: 'test.qweatherapi.com' },
      adminCookie,
      'PATCH',
    );
    expect(kept.data.hasKey).toBe(true);
    const disabled = await call(
      '/admin/weather',
      { provider: 'disabled', host: '', clearKey: true },
      adminCookie,
      'PATCH',
    );
    expect(disabled.data.hasKey).toBe(false);
    expect((await call('/bootstrap')).data.capabilities.weather).toBe(false);
  });
  it('天气服务域名不允许任意内部地址', async () => {
    const result = await call(
      '/admin/weather',
      { provider: 'qweather', host: '127.0.0.1', apiKey: 'test-only' },
      adminCookie,
      'PATCH',
    );
    expect(result.response.status).toBe(400);
  });
});
