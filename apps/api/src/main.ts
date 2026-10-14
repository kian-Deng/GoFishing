import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), process.cwd().endsWith('api') ? '../../.env' : '.env'), quiet: true });
// 模块必须在 dotenv 之后加载，避免开发认证及目录提前读取环境变量。
const { Core, root } = await import('./core.js');
const { AuthController } = await import('./auth.controller.js');
const { PublicController } = await import('./public.controller.js');
const { TripsController } = await import('./trips.controller.js');
const { MediaController } = await import('./media.controller.js');
const { AdminController } = await import('./admin.controller.js');
const { Module, Catch, HttpException } = await import('@nestjs/common');
const { NestFactory } = await import('@nestjs/core');
const { default: cookieParser } = await import('cookie-parser');
const { default: helmet } = await import('helmet');
const { default: express } = await import('express');
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Module({
  controllers: [AuthController, PublicController, TripsController, MediaController, AdminController],
  providers: [Core],
})
class AppModule {}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const response = error instanceof HttpException ? error.getResponse() : null;
    const message =
      typeof response === 'string'
        ? response
        : response && typeof response === 'object' && 'message' in response
          ? response.message
          : '服务暂不可用，请稍后重试';
    if (status === 500) console.error(error);
    res.status(status).json({ message, statusCode: status });
  }
}
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: '128kb' }));
const attempts = new Map<string, { count: number; until: number }>();
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host'))
      return res.status(403).json({ message: '不允许跨站提交' });
    const key = req.ip + ':' + (req.path.includes('/auth/login') ? 'login' : 'write');
    const limit = req.path.includes('/auth/login') ? 15 : 120;
    let entry = attempts.get(key);
    if (!entry || entry.until < Date.now()) {
      entry = { count: 0, until: Date.now() + 60_000 };
      attempts.set(key, entry);
    }
    if (++entry.count > limit) return res.status(429).json({ message: '操作过于频繁，请一分钟后重试' });
    if (attempts.size > 10000) for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
  }
  next();
});
app.useGlobalFilters(new Errors());
app.enableShutdownHooks();
const staticPath = resolve(root, 'apps/web/dist');
app.use(express.static(staticPath));
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.includes('.'))
    return res.sendFile(resolve(staticPath, 'index.html'));
  next();
});
await app.get(Core).repo.read();
await app.listen(Number(process.env.PORT || 3100), process.env.HOST || '127.0.0.1');
console.log(`钓鱼真探 API：http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3100}`);
