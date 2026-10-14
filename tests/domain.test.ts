import { describe, it, expect } from 'vitest';
import { initialState, DEFAULT_RULES, type Trip, type State, type Water } from '../packages/shared/src/index';
import { ledger, seasonPhase, weekKey, distanceMeters, waterViews, publicTrip } from '../apps/api/src/domain';
const water = (id: string): Water => ({
  id,
  name: '测试水域' + id,
  district: '测试',
  description: '',
  lng: 106.7,
  lat: 26.6,
  entryNote: '',
  warning: '',
  recommended: false,
  pendingExplore: true,
  seasonTask: false,
  active: true,
  createdAt: '2026-11-01T00:00:00+08:00',
});
const trip = (id: string, waterId: string, userId = 'u1', date = '2026-11-02T09:00:00+08:00'): Trip => ({
  id,
  userId,
  waterId,
  createdAt: date,
  assetIds: [],
  catchStatus: 'blank',
  fish: [],
  note: '',
  public: false,
  light: true,
  revoked: false,
  weather: { status: 'disabled' },
  rulesSnapshot: { ...DEFAULT_RULES, enabled: true },
  seasonId: 's1',
});
function fixture() {
  const s = initialState();
  s.waters = [water('w1'), water('w2'), water('w3')];
  return s;
}
describe('赛季与积分闭环', () => {
  it('初始化没有水域、素材、榜单贡献，计分待确认', () => {
    const s = initialState();
    expect(s.waters).toHaveLength(0);
    expect(s.trips).toHaveLength(0);
    expect(s.season.rules.enabled).toBe(false);
    expect(ledger(s)).toEqual([]);
  });
  it('北京时间活动起止边界', () => {
    const s = fixture();
    expect(seasonPhase(s, +new Date('2026-10-31T23:59:59+08:00'))).toBe('upcoming');
    expect(seasonPhase(s, +new Date(s.season.startAt))).toBe('active');
    expect(seasonPhase(s, +new Date(s.season.endAt))).toBe('active');
    expect(seasonPhase(s, +new Date(s.season.endAt) + 1)).toBe('ended');
  });
  it('周常按北京时间周一划分', () => {
    expect(weekKey('2026-11-01T23:59:00+08:00')).toBe('2026-10-26');
    expect(weekKey('2026-11-02T00:00:00+08:00')).toBe('2026-11-02');
  });
  it('空军可得基础分、首次任务及拓荒分', () => {
    const s = fixture();
    s.trips = [trip('t1', 'w1')];
    expect(ledger(s).map((e) => e.type)).toEqual(['base', 'entry', 'first']);
    expect(ledger(s).reduce((n, e) => n + e.points, 0)).toBe(35);
  });
  it('同水域多次不重复计不同水域周常，冷却默认关闭', () => {
    const s = fixture();
    s.trips = [trip('t1', 'w1'), trip('t2', 'w1'), trip('t3', 'w2'), trip('t4', 'w3')];
    const entries = ledger(s);
    expect(entries.filter((e) => e.type === 'entry')).toHaveLength(1);
    expect(entries.filter((e) => e.type === 'weekly')).toHaveLength(1);
    expect(entries.find((e) => e.type === 'weekly')?.tripId).toBe('t4');
  });
  it('撤销唯一贡献熄灭水域并移除关联任务积分', () => {
    const s = fixture();
    s.trips = [trip('t1', 'w1')];
    expect(waterViews(s)[0].lit).toBe(true);
    s.trips[0].revoked = true;
    expect(ledger(s)).toEqual([]);
    expect(waterViews(s)[0].lit).toBe(false);
  });
  it('撤销首亮后顺延到下一有效贡献，其他贡献保留', () => {
    const s = fixture();
    s.trips = [trip('t1', 'w1'), trip('t2', 'w1', 'u2', '2026-11-03T09:00:00+08:00')];
    expect(ledger(s).find((e) => e.type === 'first')?.userId).toBe('u1');
    s.trips[0].revoked = true;
    expect(ledger(s).find((e) => e.type === 'first')?.userId).toBe('u2');
    expect(waterViews(s)[0].lit).toBe(true);
  });
  it('积分使用记录快照，修改默认规则不追改', () => {
    const s = fixture();
    s.trips = [trip('t1', 'w1')];
    const before = ledger(s);
    s.season.rules.base = 900;
    expect(ledger(s)).toEqual(before);
  });
  it('非本季、关闭计分、私人记录不获得活动分', () => {
    const s = fixture();
    s.trips = [
      { ...trip('t1', 'w1'), seasonId: undefined },
      { ...trip('t2', 'w2'), rulesSnapshot: { ...DEFAULT_RULES } },
      { ...trip('t3', 'w3'), light: false },
    ];
    expect(ledger(s)).toEqual([]);
  });
  it('公共分享数据不含精确位置、用户ID或原图地址', () => {
    const s = fixture();
    const t = {
      ...trip('t1', 'w1'),
      location: {
        lng: 106.712345,
        lat: 26.612345,
        accuracy: 10,
        capturedAt: new Date().toISOString(),
        system: 'WGS84' as const,
      },
    };
    const publicData = publicTrip(s, t);
    expect(publicData).not.toHaveProperty('location');
    expect(publicData).not.toHaveProperty('userId');
    expect(JSON.stringify(publicData)).not.toContain('106.712345');
  });
  it('距离计算使用米，符合 2 公里半径量纲', () => {
    expect(distanceMeters({ lng: 106.7, lat: 26.6 }, { lng: 106.7, lat: 26.6 })).toBe(0);
    expect(distanceMeters({ lng: 106.7, lat: 26.6 }, { lng: 106.7, lat: 26.618 })).toBeGreaterThan(1900);
  });
  it('2km 邻近水域产生公共覆盖，个人探水和首亮只归属所选水域', () => {
    const s = fixture();
    s.waters[1].lat = 26.61;
    s.waters[2].lat = 27;
    s.trips = [
      {
        ...trip('t1', 'w1'),
        location: {
          lng: 106.7,
          lat: 26.6,
          accuracy: 10,
          capturedAt: new Date().toISOString(),
          system: 'WGS84',
        },
        impactRadiusMeters: 2000,
      },
    ];
    expect(waterViews(s).map((w) => w.lit)).toEqual([true, true, false]);
    expect(ledger(s).filter((e) => e.type === 'first')).toHaveLength(1);
  });
});
