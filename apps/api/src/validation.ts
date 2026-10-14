import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export const coordinate = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  accuracy: z.number().min(0).max(100000),
  capturedAt: z.iso.datetime(),
  system: z.literal('WGS84'),
});
export const tripSchema = z.object({
  waterId: z.string().optional(),
  location: coordinate.optional(),
  assetIds: z.array(z.string().uuid()).min(1).max(12),
  catchStatus: z.enum(['caught', 'blank', 'scout']),
  fish: z.array(z.string().max(30)).max(10),
  note: z.string().max(2000),
  public: z.boolean(),
  light: z.boolean(),
  requestId: z.string().uuid(),
});
export const waterSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    district: z.string().trim().min(1).max(80),
    description: z.string().max(2000).default(''),
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
    entryLng: z.number().min(-180).max(180).optional(),
    entryLat: z.number().min(-90).max(90).optional(),
    entryNote: z.string().max(1000).default(''),
    warning: z.string().max(1000).default(''),
    recommended: z.boolean().default(false),
    pendingExplore: z.boolean().default(true),
    seasonTask: z.boolean().default(false),
  })
  .refine((w) => (w.entryLng === undefined) === (w.entryLat === undefined), '公开入口经纬度需要同时填写');
export const rulesSchema = z.object({
  enabled: z.boolean(),
  base: z.number().int().min(0).max(1000),
  catchBonus: z.number().int().min(0).max(1000),
  entryBonus: z.number().int().min(0).max(1000),
  firstBonus: z.number().int().min(0).max(1000),
  weeklyBonus: z.number().int().min(0).max(1000),
  weeklyTarget: z.number().int().min(1).max(100),
  titleTarget: z.number().int().min(1).max(100),
  cooldownEnabled: z.boolean(),
  cooldownHours: z.number().int().min(1).max(720),
});
export const seasonSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    rules: rulesSchema,
    rewardDescription: z.string().max(3000),
    rulesText: z.string().max(5000),
  })
  .refine((s) => +new Date(s.endAt) > +new Date(s.startAt), '活动结束时间必须晚于开始时间');
export const configSchema = z
  .object({
    amapKey: z.string().max(200),
    amapSecurityCode: z.string().max(200),
    heatDays: z.number().int().min(1).max(365),
    hotVisitors: z.number().int().min(2).max(1000),
    recentVisitors: z.number().int().min(1).max(999),
  })
  .refine((c) => c.hotVisitors > c.recentVisitors, '火热人数须大于近期人数');
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；'),
    );
  return result.data;
}
