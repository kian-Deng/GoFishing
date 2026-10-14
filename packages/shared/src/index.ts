export type Coordinate = { lng: number; lat: number; accuracy: number; capturedAt: string; system: 'WGS84' };
export type User = {
  id: string;
  nickname: string;
  region: string;
  role: 'angler' | 'admin';
  createdAt: string;
};
export type Water = {
  id: string;
  name: string;
  district: string;
  description: string;
  lng: number;
  lat: number;
  entryLng?: number;
  entryLat?: number;
  entryNote: string;
  warning: string;
  recommended: boolean;
  pendingExplore: boolean;
  seasonTask: boolean;
  active: boolean;
  createdAt: string;
};
export type WaterView = Water & {
  lit: boolean;
  visitors: number;
  recordCount: number;
  fish: string[];
  lastVisit?: string;
  heat: 'unlit' | 'visited' | 'recent' | 'hot';
  mine?: boolean;
};
export type Asset = {
  id: string;
  userId: string;
  filename: string;
  thumbnail: string;
  mime: string;
  hash: string;
  source: 'camera' | 'album';
  kind: 'environment' | 'catch';
  createdAt: string;
};
export type Weather = {
  status: 'disabled' | 'available' | 'failed';
  text?: string;
  temperature?: string;
  observedAt?: string;
  provider?: string;
};
export type Rules = {
  enabled: boolean;
  base: number;
  catchBonus: number;
  entryBonus: number;
  firstBonus: number;
  weeklyBonus: number;
  weeklyTarget: number;
  titleTarget: number;
  cooldownEnabled: boolean;
  cooldownHours: number;
};
export type Season = {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  rules: Rules;
  rewardDescription: string;
  rulesText: string;
};
export type Trip = {
  id: string;
  userId: string;
  waterId?: string;
  createdAt: string;
  litAt?: string;
  impactRadiusMeters?: number;
  location?: Coordinate;
  assetIds: string[];
  catchStatus: 'caught' | 'blank' | 'scout';
  fish: string[];
  note: string;
  public: boolean;
  light: boolean;
  revoked: boolean;
  revokeReason?: string;
  weather: Weather;
  rulesSnapshot: Rules;
  seasonId?: string;
};
export type Ledger = {
  id: string;
  userId: string;
  tripId: string;
  seasonId: string;
  type: 'base' | 'catch' | 'entry' | 'first' | 'weekly';
  points: number;
  description: string;
};
export type Application = {
  id: string;
  userId: string;
  name: string;
  district: string;
  note: string;
  location: Coordinate;
  tripId?: string;
  status: 'pending' | 'accepted' | 'rejected';
  reason?: string;
  waterId?: string;
  createdAt: string;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  kind: 'announcement' | 'results' | 'awards';
};
export type Audit = {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  reason: string;
  createdAt: string;
};
export type Config = {
  amapKey: string;
  amapSecurityCode: string;
  heatDays: number;
  hotVisitors: number;
  recentVisitors: number;
};
export type State = {
  version: 1;
  users: User[];
  waters: Water[];
  assets: Asset[];
  trips: Trip[];
  applications: Application[];
  notices: Notice[];
  audit: Audit[];
  config: Config;
  season: Season;
  weatherConfig?: { provider: 'disabled' | 'qweather'; host: string; encryptedKey: string };
};
export const FISH = ['鲫鱼', '鲤鱼', '草鱼', '鳊鱼', '黄辣丁', '鲈鱼', '翘嘴', '其他', '不确定'] as const;
export const DEFAULT_RULES: Rules = {
  enabled: false,
  base: 10,
  catchBonus: 5,
  entryBonus: 5,
  firstBonus: 20,
  weeklyBonus: 10,
  weeklyTarget: 3,
  titleTarget: 1,
  cooldownEnabled: false,
  cooldownHours: 24,
};
export const initialState = (): State => ({
  version: 1,
  users: [],
  waters: [],
  assets: [],
  trips: [],
  applications: [],
  notices: [],
  audit: [],
  config: { amapKey: '', amapSecurityCode: '', heatDays: 14, hotVisitors: 5, recentVisitors: 2 },
  season: {
    id: 's1',
    name: '点亮黔中水',
    startAt: '2026-11-01T00:00:00+08:00',
    endAt: '2027-01-31T23:59:59.999+08:00',
    rules: { ...DEFAULT_RULES },
    rewardDescription: '活动礼物及领取办法待运营发布。',
    rulesText:
      '贵州省内现场环境照片与有效定位，提交后即时点亮。精确下竿位置不公开。计分规则经运营确认启用后生效。',
  },
});
