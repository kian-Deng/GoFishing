import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { Core, uploadDir } from './core.js';
import { parse } from './validation.js';
import type { Asset } from '../../../packages/shared/src/index.js';

@Controller('api/media')
export class MediaController {
  constructor(@Inject(Core) private core: Core) {}
  @Post('capture') async capture(@Req() req: Request, @Body() input: unknown) {
    const state = await this.core.repo.read();
    const user = this.core.user(req, state);
    const { kind } = parse(z.object({ kind: z.enum(['environment', 'catch']) }), input);
    for (const [key, value] of this.core.captures)
      if (value.expires < Date.now()) this.core.captures.delete(key);
    const token = randomUUID();
    this.core.captures.set(token, { userId: user.id, kind, expires: Date.now() + 15 * 60_000 });
    return { token };
  }
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('photos', 1, { limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 4 } }),
  )
  async upload(@Req() req: Request, @Body() input: unknown, @UploadedFiles() files: Express.Multer.File[]) {
    const state = await this.core.repo.read();
    const user = this.core.user(req, state);
    const body = parse(
      z.object({
        source: z.enum(['camera', 'album']),
        kind: z.enum(['environment', 'catch']),
        token: z.string().uuid().optional(),
      }),
      input,
    );
    if (!files?.length) throw new BadRequestException('请选择图片');
    if (body.source === 'camera') {
      const capture = this.core.captures.get(body.token || '');
      if (
        !capture ||
        capture.userId !== user.id ||
        capture.kind !== body.kind ||
        capture.expires < Date.now()
      )
        throw new BadRequestException('拍摄会话已失效，请重新提交');
      this.core.captures.delete(body.token!);
    }
    const file = files[0];
    let normalized: Buffer,
      thumb: Buffer,
      format = 'jpeg';
    try {
      const image = sharp(file.buffer, { limitInputPixels: 40_000_000, animated: false });
      const metadata = await image.metadata();
      format = metadata.format || '';
      if (!['jpeg', 'png', 'webp'].includes(format)) throw new Error('format');
      normalized = await image.rotate().jpeg({ quality: 94 }).toBuffer();
      thumb = await sharp(normalized)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      throw new BadRequestException('图片无法读取，请使用 JPG、PNG 或 WebP，大小不超过 12MB');
    }
    const id = randomUUID();
    await mkdir(uploadDir, { recursive: true });
    const asset: Asset = {
      id,
      userId: user.id,
      filename: id + '.' + (format === 'jpeg' ? 'jpg' : format),
      thumbnail: id + '-thumb.jpg',
      mime: 'image/' + format,
      hash: createHash('sha256').update(normalized).digest('hex'),
      source: body.source,
      kind: body.kind,
      createdAt: new Date().toISOString(),
    };
    await writeFile(join(uploadDir, asset.filename), file.buffer);
    await writeFile(join(uploadDir, asset.thumbnail), thumb);
    await this.core.repo.mutate((s) => s.assets.push(asset));
    return { id: asset.id, kind: asset.kind, source: asset.source, url: '/api/media/' + id + '/private' };
  }
  @Get(':id/:visibility') async image(
    @Param('id') id: string,
    @Param('visibility') visibility: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const state = await this.core.repo.read();
    const asset = this.core.find(state.assets, id);
    let filename = asset.thumbnail;
    if (visibility === 'public') {
      if (!state.trips.some((t) => t.public && !t.revoked && t.assetIds.includes(id)))
        throw new BadRequestException('图片未公开');
    } else {
      const user = this.core.user(req, state);
      if (user.id !== asset.userId && user.role !== 'admin') throw new BadRequestException('无权查看此素材');
      filename = visibility === 'original' ? asset.filename : asset.thumbnail;
    }
    res.setHeader('Content-Type', visibility === 'original' ? asset.mime : 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (visibility === 'original')
      res.setHeader('Content-Disposition', `attachment; filename="fishing-${asset.filename}"`);
    return res.send(await readFile(join(uploadDir, filename)));
  }
}
