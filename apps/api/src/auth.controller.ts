import { Body, Controller, Get, Inject, Post, Req, Res, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Core, devAuth } from './core.js';
import { parse } from './validation.js';

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(Core) private core: Core) {}
  @Get('me') async me(@Req() req: Request) {
    const state = await this.core.repo.read();
    return {
      user: this.core.optionalUser(req, state) || null,
      devAuth,
      adminEnabled: (process.env.ADMIN_PASSWORD?.length || 0) >= 12,
    };
  }
  @Post('login') async login(
    @Body() input: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const body = parse(
      z.object({ nickname: z.string().trim().min(2).max(20), password: z.string().max(200).optional() }),
      input,
    );
    if (body.password) this.core.verifyAdmin(body.password);
    else if (!devAuth) throw new ForbiddenException('真实手机号 / 微信登录尚未接入，请联系管理员');
    const user = await this.core.repo.mutate((state) => {
      if (body.password) {
        let user = state.users.find((u) => u.role === 'admin');
        if (!user) {
          user = {
            id: randomUUID(),
            nickname: '管理员',
            region: '贵阳',
            role: 'admin',
            createdAt: new Date().toISOString(),
          };
          state.users.push(user);
        }
        return user;
      }
      const existing = this.core.optionalUser(req, state);
      if (existing) {
        existing.nickname = body.nickname;
        return existing;
      }
      const user = {
        id: randomUUID(),
        nickname: body.nickname,
        region: '贵阳',
        role: 'angler' as const,
        createdAt: new Date().toISOString(),
      };
      state.users.push(user);
      return user;
    });
    res.cookie('fishing_session', this.core.session(user), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 7 * 86400_000,
      path: '/',
    });
    return { user };
  }
  @Post('logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.core.sessions.delete(req.cookies?.fishing_session);
    res.clearCookie('fishing_session', { path: '/' });
    return { ok: true };
  }
}
