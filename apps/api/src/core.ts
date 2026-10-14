import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Request } from 'express';
import type { State, User, Weather } from '../../../packages/shared/src/index.js';
import { FileRepository, PostgresRepository, type Repository } from './repository.js';

export const root = resolve(
  process.env.PROJECT_ROOT || process.cwd(),
  process.cwd().endsWith('api') ? '../..' : '.',
);
export const uploadDir = resolve(root, process.env.UPLOAD_DIR || 'uploads');
export const devAuth = process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH === 'true';
@Injectable()
export class Core {
  readonly repo: Repository;
  readonly sessions = new Map<string, { userId: string; expires: number }>();
  readonly captures = new Map<string, { userId: string; kind: 'environment' | 'catch'; expires: number }>();
  private encryptionKey?: Promise<Buffer>;
  constructor() {
    this.repo =
      process.env.DATA_DRIVER === 'postgres'
        ? new PostgresRepository(process.env.DATABASE_URL || '')
        : new FileRepository(resolve(root, process.env.DATA_DIR || 'data'));
  }
  user(req: Request, state: State, admin = false) {
    const session = this.sessions.get(req.cookies?.fishing_session);
    if (!session || session.expires < Date.now()) throw new UnauthorizedException('请先登录');
    const user = state.users.find((u) => u.id === session.userId);
    if (!user) throw new UnauthorizedException('登录已失效');
    if (admin && user.role !== 'admin') throw new ForbiddenException('需要管理员权限');
    return user;
  }
  optionalUser(req: Request, state: State) {
    try {
      return this.user(req, state);
    } catch {
      return undefined;
    }
  }
  session(user: User) {
    for (const [key, value] of this.sessions) if (value.expires < Date.now()) this.sessions.delete(key);
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { userId: user.id, expires: Date.now() + 7 * 86400_000 });
    return token;
  }
  verifyAdmin(password: string) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected || expected.length < 12) throw new ForbiddenException('请先配置至少 12 位 ADMIN_PASSWORD');
    const a = Buffer.from(password),
      b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('管理员密码错误');
  }
  find<T extends { id: string }>(items: T[], id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) throw new NotFoundException('记录不存在');
    return item;
  }
  audit(state: State, userId: string, action: string, targetId: string, reason: string) {
    state.audit.push({
      id: randomUUID(),
      actorId: userId,
      action,
      targetId,
      reason,
      createdAt: new Date().toISOString(),
    });
  }
  private key() {
    return (this.encryptionKey ??= (async () => {
      const directory = resolve(root, process.env.DATA_DIR || 'data');
      const path = resolve(directory, '.config.key');
      await mkdir(directory, { recursive: true });
      try {
        return Buffer.from(await readFile(path, 'utf8'), 'hex');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const key = randomBytes(32);
        try {
          await writeFile(path, key.toString('hex'), { flag: 'wx', mode: 0o600 });
          return key;
        } catch (writeError) {
          if ((writeError as NodeJS.ErrnoException).code === 'EEXIST')
            return Buffer.from(await readFile(path, 'utf8'), 'hex');
          throw writeError;
        }
      }
    })());
  }
  async encryptSecret(value: string) {
    if (!value) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
  }
  private async decryptSecret(value: string) {
    if (!value) return '';
    const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64'));
    const cipher = createDecipheriv('aes-256-gcm', await this.key(), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
  }
  async weatherSettings(state: State) {
    if (state.weatherConfig)
      return {
        provider: state.weatherConfig.provider,
        host: state.weatherConfig.host,
        apiKey: await this.decryptSecret(state.weatherConfig.encryptedKey),
        source: 'admin',
      };
    return {
      provider: process.env.WEATHER_PROVIDER === 'qweather' ? 'qweather' : 'disabled',
      host: process.env.QWEATHER_HOST || '',
      apiKey: process.env.QWEATHER_API_KEY || '',
      source: 'environment',
    };
  }
  async weatherSummary(state: State) {
    const settings = await this.weatherSettings(state);
    return {
      provider: settings.provider,
      host: settings.host,
      hasKey: !!settings.apiKey,
      source: settings.source,
      ready: settings.provider === 'qweather' && !!settings.host && !!settings.apiKey,
    };
  }
  async weather(location?: { lng: number; lat: number }): Promise<Weather> {
    const settings = await this.weatherSettings(await this.repo.read());
    if (!location || settings.provider !== 'qweather' || !settings.host || !settings.apiKey)
      return { status: 'disabled' };
    try {
      const host = settings.host;
      if (!/^[a-zA-Z0-9.-]+\.qweatherapi\.com$/.test(host)) throw new Error('天气域名不合法');
      const response = await fetch(
        `https://${host}/v7/weather/now?location=${location.lng.toFixed(2)},${location.lat.toFixed(2)}`,
        { headers: { 'X-QW-Api-Key': settings.apiKey }, signal: AbortSignal.timeout(4000) },
      );
      const data = (await response.json()) as {
        code: string;
        now?: { text: string; temp: string; obsTime: string };
      };
      if (data.code !== '200' || !data.now) throw new Error('天气服务失败');
      return {
        status: 'available',
        text: data.now.text,
        temperature: data.now.temp,
        observedAt: data.now.obsTime,
        provider: '和风天气',
      };
    } catch {
      return { status: 'failed' };
    }
  }
  async onModuleDestroy() {
    await this.repo.close();
  }
}
