import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Core } from './core.js';
import { ledger, publicTrip, seasonPhase, waterViews, weekKey, firstExplorers } from './domain.js';

@Controller('api')
export class PublicController {
  constructor(@Inject(Core) private core: Core) {}
  @Get('health') async health() {
    await this.core.repo.read();
    return { status: 'ok', database: process.env.DATA_DRIVER || 'file', regionRestriction: false };
  }
  @Get('bootstrap') async bootstrap() {
    const state = await this.core.repo.read();
    return {
      season: state.season,
      config: { amapKey: state.config.amapKey, amapSecurityCode: state.config.amapSecurityCode },
      capabilities: {
        regionRestriction: false,
        map: !!state.config.amapKey,
        weather: (await this.core.weatherSummary(state)).ready,
        login:
          process.env.DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production'
            ? 'development'
            : 'not-configured',
      },
      serverTime: new Date().toISOString(),
    };
  }
  @Get('waters') async waters(@Req() req: Request) {
    const state = await this.core.repo.read();
    return waterViews(state, this.core.optionalUser(req, state)?.id);
  }
  @Get('waters/:id') async water(@Param('id') id: string) {
    const state = await this.core.repo.read();
    const water = this.core.find(waterViews(state), id);
    return {
      water,
      records: state.trips
        .filter((t) => t.waterId === id && t.public && !t.revoked)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30)
        .map((t) => publicTrip(state, t)),
    };
  }
  @Get('activity') async activity(@Req() req: Request) {
    const state = await this.core.repo.read();
    const user = this.core.optionalUser(req, state);
    const entries = ledger(state);
    const trips = state.trips.filter(
      (t) =>
        t.light &&
        !t.revoked &&
        t.seasonId === state.season.id &&
        state.waters.some((w) => w.id === t.waterId && w.active),
    );
    const participants = [...new Set(trips.map((t) => t.userId))];
    const board = participants.map((id) => ({
      userId: id,
      nickname: state.users.find((u) => u.id === id)?.nickname || '钓友',
      points: entries.filter((e) => e.userId === id).reduce((sum, e) => sum + e.points, 0),
      waters: new Set(trips.filter((t) => t.userId === id).map((t) => t.waterId)).size,
      first: firstExplorers(state).filter((t) => t.userId === id).length,
    }));
    const rank = (key: 'points' | 'waters' | 'first') =>
      board
        .filter((row) => key === 'waters' || row[key] > 0)
        .sort((a, b) => b[key] - a[key] || a.userId.localeCompare(b.userId))
        .map((row, index) => ({ ...row, rank: index + 1 }));
    const own = board.find((r) => r.userId === user?.id);
    const myTrips = trips.filter((t) => t.userId === user?.id);
    const weekWaters = new Set(
      myTrips
        .filter((t) => weekKey(t.litAt || t.createdAt) === weekKey(new Date().toISOString()))
        .map((t) => t.waterId),
    ).size;
    return {
      season: state.season,
      phase: seasonPhase(state),
      serverTime: new Date().toISOString(),
      boards: { points: rank('points'), waters: rank('waters'), first: rank('first') },
      mine: {
        points: own?.points || 0,
        waters: own?.waters || 0,
        first: own?.first || 0,
        rank: rank('points').find((r) => r.userId === user?.id)?.rank || null,
        weekWaters,
        title:
          state.season.rules.enabled && (own?.waters || 0) >= state.season.rules.titleTarget
            ? '初探黔中'
            : null,
      },
      ledger: entries.filter((e) => e.userId === user?.id),
      notices: state.notices,
    };
  }
}
