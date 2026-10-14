import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Core } from './core.js';
import { coordinate, parse, tripSchema } from './validation.js';
import { distanceMeters, ledger, publicTrip, seasonPhase } from './domain.js';
import { FISH, type Trip } from '../../../packages/shared/src/index.js';

@Controller('api')
export class TripsController {
  constructor(@Inject(Core) private core: Core) {}
  @Get('trips') async mine(@Req() req: Request) {
    const state = await this.core.repo.read();
    const user = this.core.user(req, state);
    const entries = ledger(state);
    return state.trips
      .filter((t) => t.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({
        ...t,
        waterName: state.waters.find((w) => w.id === t.waterId)?.name || '未关联水域',
        assets: state.assets
          .filter((a) => t.assetIds.includes(a.id))
          .map((a) => ({ id: a.id, kind: a.kind, source: a.source, url: '/api/media/' + a.id + '/private' })),
        points: entries.filter((e) => e.tripId === t.id).reduce((sum, e) => sum + e.points, 0),
      }));
  }
  @Post('trips') async create(@Req() req: Request, @Body() input: unknown) {
    const body = parse(tripSchema, input);
    const state = await this.core.repo.read();
    this.core.user(req, state);
    const weather = await this.core.weather(body.location);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s);
      const existing = s.trips.find((t) => t.id === body.requestId);
      if (existing) {
        if (existing.userId !== user.id) throw new BadRequestException('请求编号冲突，请重新保存');
        if (existing.light || !body.light)
          return {
            trip: existing,
            replayed: true,
            points: ledger(s)
              .filter((e) => e.tripId === existing.id)
              .reduce((sum, e) => sum + e.points, 0),
          };
        if (existing.revoked) throw new BadRequestException('已撤销的记录不能重新点亮');
      }
      const assets = body.assetIds.map((id) => this.core.find(s.assets, id));
      if (new Set(body.assetIds).size !== body.assetIds.length || assets.some((a) => a.userId !== user.id))
        throw new BadRequestException('素材不属于当前账号或重复');
      if (body.fish.some((f) => !FISH.includes(f as (typeof FISH)[number])))
        throw new BadRequestException('请选择有效鱼种');
      if (body.catchStatus !== 'caught' && body.fish.length)
        throw new BadRequestException('空军或探路不填写鱼种');
      if (body.public && body.catchStatus === 'caught' && !assets.some((a) => a.kind === 'catch'))
        throw new BadRequestException('分享鱼获需要鱼获照片');
      if (body.waterId && !s.waters.some((w) => w.id === body.waterId && w.active))
        throw new BadRequestException('水域不存在');
      if (body.light) {
        if (!body.location || !body.waterId) throw new BadRequestException('点亮需要定位并选择水域');
        if (!assets.some((a) => a.kind === 'environment' && a.source === 'camera'))
          throw new BadRequestException('点亮需要现场拍摄环境照片');
        if (body.catchStatus === 'caught' && !assets.some((a) => a.kind === 'catch' && a.source === 'camera'))
          throw new BadRequestException('鱼获点亮需要现场鱼获照片');
        const age = Date.now() - +new Date(body.location.capturedAt);
        if (age > 24 * 3600_000 || age < -60_000)
          throw new BadRequestException('定位超过 24 小时或设备时间异常，请刷新定位');
        if (body.location.accuracy > 1000) throw new BadRequestException('定位误差超过 1 公里，请重新定位');
        const water = this.core.find(s.waters, body.waterId);
        if (distanceMeters(body.location, water) > 20000)
          throw new BadRequestException('当前定位距离所选水域超过 20 公里，请确认水域');
        const prior = s.trips.filter((t) => t.userId === user.id && t.light && !t.revoked);
        const hashes = new Set(
          s.assets.filter((a) => prior.some((t) => t.assetIds.includes(a.id))).map((a) => a.hash),
        );
        if (assets.some((a) => hashes.has(a.hash)))
          throw new BadRequestException('该图片已经用于点亮，请拍摄本次出钓照片');
        if (
          s.season.rules.cooldownEnabled &&
          prior.some(
            (t) =>
              t.waterId === body.waterId &&
              Date.now() - +new Date(t.createdAt) < s.season.rules.cooldownHours * 3600_000,
          )
        )
          throw new BadRequestException('该水域仍在配置的冷却时间内');
      }
      const trip: Trip = {
        id: body.requestId,
        userId: user.id,
        waterId: body.waterId,
        createdAt: existing?.createdAt || new Date().toISOString(),
        litAt: body.light ? new Date().toISOString() : undefined,
        impactRadiusMeters: body.light ? 2000 : undefined,
        location: body.location,
        assetIds: body.assetIds,
        catchStatus: body.catchStatus,
        fish: body.fish,
        note: body.note,
        public: body.public,
        light: body.light,
        revoked: false,
        weather,
        rulesSnapshot: structuredClone(s.season.rules),
        seasonId: body.light && seasonPhase(s) === 'active' ? s.season.id : undefined,
      };
      if (existing) Object.assign(existing, trip);
      else s.trips.push(trip);
      this.core.audit(s, user.id, 'trip.create', trip.id, body.light ? '即时点亮' : '私人记录');
      return {
        trip,
        points: ledger(s)
          .filter((e) => e.tripId === trip.id)
          .reduce((sum, e) => sum + e.points, 0),
        regionRestriction: false,
      };
    });
  }
  @Patch('trips/:id/visibility') async visibility(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const body = parse(z.object({ public: z.boolean() }), input);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s);
      const trip = this.core.find(s.trips, id);
      if (trip.userId !== user.id) throw new BadRequestException('只能修改自己的记录');
      if (trip.revoked) throw new BadRequestException('记录已撤销，不能重新公开');
      if (
        body.public &&
        trip.catchStatus === 'caught' &&
        !s.assets.some((a) => trip.assetIds.includes(a.id) && a.kind === 'catch')
      )
        throw new BadRequestException('分享鱼获需要鱼获照片');
      trip.public = body.public;
      return { ok: true };
    });
  }
  @Post('trips/:id/revoke') async revoke(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(500) }), input);
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s);
      const trip = this.core.find(s.trips, id);
      if (trip.userId !== user.id && user.role !== 'admin') throw new BadRequestException('无权撤销该记录');
      const before = ledger(s);
      trip.revoked = true;
      trip.public = false;
      trip.revokeReason = reason;
      const after = ledger(s);
      this.core.audit(s, user.id, 'trip.revoke', id, reason);
      return {
        ok: true,
        removedPoints:
          before.reduce((sum, e) => sum + e.points, 0) - after.reduce((sum, e) => sum + e.points, 0),
      };
    });
  }
  @Get('share/:id') async share(@Param('id') id: string) {
    const s = await this.core.repo.read();
    const trip = this.core.find(s.trips, id);
    if (!trip.public || trip.revoked) throw new BadRequestException('该记录未公开或已撤销');
    return {
      ...publicTrip(s, trip),
      waterName: s.waters.find((w) => w.id === trip.waterId)?.name || '一次出钓',
    };
  }
  @Get('applications') async applications(@Req() req: Request) {
    const s = await this.core.repo.read();
    const user = this.core.user(req, s);
    return s.applications.filter((a) => a.userId === user.id);
  }
  @Post('applications') async apply(@Req() req: Request, @Body() input: unknown) {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        district: z.string().trim().min(1).max(80),
        note: z.string().max(1000),
        location: coordinate,
        tripId: z.string().uuid().optional(),
      }),
      input,
    );
    return this.core.repo.mutate((s) => {
      const user = this.core.user(req, s);
      if (body.tripId && !s.trips.some((t) => t.id === body.tripId && t.userId === user.id))
        throw new BadRequestException('记录不存在');
      const app = {
        ...body,
        id: randomUUID(),
        userId: user.id,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };
      s.applications.push(app);
      return app;
    });
  }
}
