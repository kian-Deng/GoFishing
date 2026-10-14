import { type Ledger, type State, type Trip, type WaterView } from '../../../packages/shared/src/index.js';

export function distanceMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function weekKey(iso: string) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
export function seasonPhase(state: State, now = Date.now()) {
  return now < +new Date(state.season.startAt)
    ? 'upcoming'
    : now > +new Date(state.season.endAt)
      ? 'ended'
      : 'active';
}
export function firstExplorers(state: State) {
  const first = new Map<string, Trip>();
  for (const t of state.trips
    .filter((t) => t.light && !t.revoked && state.waters.some((w) => w.id === t.waterId && w.active))
    .sort((a, b) => (a.litAt || a.createdAt).localeCompare(b.litAt || b.createdAt))) {
    if (!first.has(t.waterId!)) first.set(t.waterId!, t);
  }
  return [...first.values()].filter((t) => t.seasonId === state.season.id);
}
export function ledger(state: State): Ledger[] {
  const rows: Ledger[] = [];
  const entry = new Set<string>(),
    first = new Set<string>(),
    weekly = new Map<string, Set<string>>(),
    weeklyDone = new Set<string>();
  const trips = state.trips
    .filter((t) => t.light && !t.revoked && state.waters.some((w) => w.id === t.waterId && w.active))
    .sort(
      (a, b) => (a.litAt || a.createdAt).localeCompare(b.litAt || b.createdAt) || a.id.localeCompare(b.id),
    );
  for (const trip of trips) {
    const isFirst = !first.has(trip.waterId!);
    first.add(trip.waterId!);
    if (trip.seasonId !== state.season.id || !trip.rulesSnapshot.enabled) continue;
    const rules = trip.rulesSnapshot;
    const userKey = trip.userId;
    const wk = trip.userId + ':' + weekKey(trip.litAt || trip.createdAt);
    const waters = weekly.get(wk) || new Set<string>();
    waters.add(trip.waterId!);
    weekly.set(wk, waters);
    const add = (type: Ledger['type'], points: number, description: string) => {
      if (points > 0)
        rows.push({
          id: trip.id + ':' + type,
          userId: trip.userId,
          tripId: trip.id,
          seasonId: trip.seasonId!,
          type,
          points,
          description,
        });
    };
    add('base', rules.base, '有效点亮');
    if (trip.catchStatus === 'caught') add('catch', rules.catchBonus, '鱼获记录');
    if (!entry.has(userKey)) {
      entry.add(userKey);
      add('entry', rules.entryBonus, '入门亮灯');
    }
    if (isFirst) add('first', rules.firstBonus, '拓荒首亮');
    if (waters.size >= rules.weeklyTarget && !weeklyDone.has(wk)) {
      weeklyDone.add(wk);
      add('weekly', rules.weeklyBonus, '周常探图');
    }
  }
  return rows;
}
export function waterViews(state: State, userId?: string, now = Date.now()): WaterView[] {
  return state.waters
    .filter((w) => w.active)
    .map((w) => {
      const trips = state.trips.filter(
        (t) =>
          t.light &&
          !t.revoked &&
          state.waters.some((source) => source.id === t.waterId && source.active) &&
          (t.waterId === w.id ||
            (!!t.location && distanceMeters(w, t.location) <= (t.impactRadiusMeters || 2000))),
      );
      const recent = trips.filter(
        (t) => now - +new Date(t.litAt || t.createdAt) <= state.config.heatDays * 86400_000,
      );
      const visitors = new Set(recent.map((t) => t.userId)).size;
      return {
        ...w,
        lit: trips.length > 0,
        visitors,
        recordCount: trips.length,
        fish: [...new Set(trips.filter((t) => t.public).flatMap((t) => t.fish))],
        lastVisit: trips.at(-1)?.litAt || trips.at(-1)?.createdAt,
        heat: !trips.length
          ? 'unlit'
          : visitors >= state.config.hotVisitors
            ? 'hot'
            : visitors >= state.config.recentVisitors
              ? 'recent'
              : 'visited',
        mine: !!userId && trips.some((t) => t.userId === userId),
      };
    });
}
export function publicTrip(state: State, t: Trip) {
  return {
    id: t.id,
    waterId: t.waterId,
    createdAt: t.createdAt,
    catchStatus: t.catchStatus,
    fish: t.fish,
    note: t.note,
    weather: t.weather,
    author: state.users.find((u) => u.id === t.userId)?.nickname || '钓友',
    assets: state.assets
      .filter((a) => t.assetIds.includes(a.id))
      .map((a) => ({ id: a.id, kind: a.kind, url: '/api/media/' + a.id + '/public' })),
  };
}
