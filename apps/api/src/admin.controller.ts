import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Core } from './core.js';
import { configSchema, parse, seasonSchema, waterSchema } from './validation.js';
import { ledger } from './domain.js';

@Controller('api/admin')
export class AdminController {
  constructor(@Inject(Core) private core: Core) {}
  @Get('weather') async weatherConfig(@Req() req: Request) {
    const state = await this.core.repo.read();
    this.core.user(req, state, true);
    return this.core.weatherSummary(state);
  }
  @Patch('weather') async saveWeather(@Req() req: Request, @Body() input: unknown) {
    const body = parse(
      z.object({
        provider: z.enum(['disabled', 'qweather']),
        host: z.string().trim().max(200),
        apiKey: z.string().trim().max(1000).optional(),
        clearKey: z.boolean().optional(),
      }),
      input,
    );
    const state = await this.core.repo.read();
    this.core.user(req, state, true);
    if (body.host && !/^[a-zA-Z0-9.-]+\.qweatherapi\.com$/.test(body.host))
      throw new BadRequestException('请填写和风控制台的 *.qweatherapi.com 域名，不带 https://');
    const previous = await this.core.weatherSettings(state);
    const apiKey = body.clearKey ? '' : body.apiKey || previous.apiKey;
    if (body.provider === 'qweather' && (!body.host || !apiKey))
      throw new BadRequestException('启用天气前请填写域名和 API Key');
    const encryptedKey = await this.core.encryptSecret(apiKey);
    await this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      s.weatherConfig = { provider: body.provider, host: body.host, encryptedKey };
      this.core.audit(s, user.id, 'weather.update', 'system', '更新天气配置，密钥不写入日志');
    });
    return this.core.weatherSummary(await this.core.repo.read());
  }
  @Post('weather/test') async testWeather(@Req() req: Request) {
    this.core.user(req, await this.core.repo.read(), true);
    const result = await this.core.weather({ lng: 106.71, lat: 26.58 });
    return {
      result,
      message:
        result.status === 'available'
          ? '天气连接正常'
          : result.status === 'disabled'
            ? '天气尚未启用或配置不完整'
            : '天气连接失败，请检查域名、密钥、额度和服务端网络',
    };
  }
  @Get('overview') async overview(@Req() req: Request) {
    const s = await this.core.repo.read();
    this.core.user(req, s, true);
    return {
      waters: s.waters,
      applications: s.applications,
      season: s.season,
      config: s.config,
      notices: s.notices,
      users: s.users.map((u) => ({ id: u.id, nickname: u.nickname, role: u.role })),
      trips: s.trips.map((t) => ({
        ...t,
        waterName: s.waters.find((w) => w.id === t.waterId)?.name || '未关联',
        nickname: s.users.find((u) => u.id === t.userId)?.nickname || '钓友',
      })),
      audit: s.audit.slice(-100).reverse(),
      ledger: ledger(s),
    };
  }
  @Post('waters') async addWater(@Req() req: Request, @Body() input: unknown) {
    const body = parse(waterSchema, input);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      const water = { ...body, id: randomUUID(), active: true, createdAt: new Date().toISOString() };
      s.waters.push(water);
      this.core.audit(s, user.id, 'water.create', water.id, '新增水域，区域限制尚未启用');
      return water;
    });
  }
  @Patch('waters/:id') async updateWater(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const body = parse(waterSchema, input);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      Object.assign(this.core.find(s.waters, id), body);
      this.core.audit(s, user.id, 'water.update', id, '更新水域');
      return { ok: true };
    });
  }
  @Post('waters/:id/archive') async archive(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const { reason } = parse(z.object({ reason: z.string().min(2).max(500) }), input);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      this.core.find(s.waters, id).active = false;
      for (const trip of s.trips.filter((t) => t.waterId === id)) {
        trip.revoked = true;
        trip.public = false;
        trip.revokeReason = reason;
      }
      this.core.audit(s, user.id, 'water.archive', id, reason);
      return { ok: true };
    });
  }
  @Patch('config') async config(@Req() req: Request, @Body() input: unknown) {
    const body = parse(configSchema, input);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      s.config = body;
      this.core.audit(s, user.id, 'config.update', 'system', '更新地图及热度配置');
      return { ok: true };
    });
  }
  @Patch('season') async season(@Req() req: Request, @Body() input: unknown) {
    const body = parse(seasonSchema, input);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      if (
        s.trips.some((t) => t.seasonId === s.season.id) &&
        (body.startAt !== s.season.startAt || body.endAt !== s.season.endAt)
      )
        throw new BadRequestException('本季已有记录，不能修改赛季时间');
      s.season = { ...s.season, ...body };
      this.core.audit(s, user.id, 'season.update', s.season.id, '新提交使用新积分规则；既有记录保留规则快照');
      return { ok: true };
    });
  }
  @Post('notices') async notice(@Req() req: Request, @Body() input: unknown) {
    const body = parse(
      z.object({
        title: z.string().min(2).max(100),
        body: z.string().min(2).max(5000),
        kind: z.enum(['announcement', 'results', 'awards']),
      }),
      input,
    );
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      const notice = { ...body, id: randomUUID(), createdAt: new Date().toISOString() };
      s.notices.push(notice);
      this.core.audit(s, user.id, 'notice.create', notice.id, body.title);
      return notice;
    });
  }
  @Post('applications/:id/resolve') async resolve(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const body = parse(
      z.object({
        action: z.enum(['accept', 'reject', 'link']),
        reason: z.string().max(500),
        waterId: z.string().optional(),
      }),
      input,
    );
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s, true);
      const app = this.core.find(s.applications, id);
      if (app.status !== 'pending') throw new BadRequestException('申请已处理');
      if (body.action === 'reject') {
        if (body.reason.trim().length < 2) throw new BadRequestException('请填写驳回原因');
        app.status = 'rejected';
        app.reason = body.reason;
      } else {
        const water =
          body.action === 'link'
            ? this.core.find(s.waters, body.waterId || '')
            : {
                id: randomUUID(),
                name: app.name,
                district: app.district,
                description: app.note,
                lng: Number(app.location.lng.toFixed(2)),
                lat: Number(app.location.lat.toFixed(2)),
                entryNote: '尚未维护公开入口',
                warning: '',
                recommended: false,
                pendingExplore: true,
                seasonTask: false,
                active: true,
                createdAt: new Date().toISOString(),
              };
        if (!water.active) throw new BadRequestException('水域已归档');
        if (body.action === 'accept') s.waters.push(water);
        app.status = 'accepted';
        app.waterId = water.id;
        if (app.tripId) {
          const trip = this.core.find(s.trips, app.tripId);
          trip.waterId = water.id;
        }
      }
      this.core.audit(
        s,
        user.id,
        'application.' + body.action,
        id,
        body.reason || '采纳 / 关联水域；不自动补发点亮积分',
      );
      return app;
    });
  }
  @Get('export') async export(@Req() req: Request, @Res() res: Response) {
    const s = await this.core.repo.read();
    const user = this.core.user(req, s, true);
    await this.core.repo.mutate((state) =>
      this.core.audit(state, user.id, 'export.create', 'season', '导出不含精确坐标的成绩和记录'),
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fishing-export.json"');
    return res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          season: s.season,
          ledger: ledger(s),
          trips: s.trips.map((t) => ({
            id: t.id,
            userId: t.userId,
            waterId: t.waterId,
            createdAt: t.createdAt,
            light: t.light,
            revoked: t.revoked,
            fish: t.fish,
          })),
        },
        null,
        2,
      ),
    );
  }
}
