import { Controller, Get, HttpCode, Inject, Module, Param, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { uuid } from '@trackrex/schemas';
import { CONFIG, type Config } from '../../core/config.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { LocalDiskStorage, STORAGE, type StorageProvider } from './storage.js';

export const MAX_SELFIE_BYTES = 1_500_000;
const params = z.object({ tenantId: uuid, userId: uuid, name: z.string().regex(/^[0-9a-f-]{36}\.jpg$/) });
export const selfieKeyFor = (tenantId: string, userId: string, id: string) => `selfies/${tenantId}/${userId}/${id}.jpg`;

/**
 * Selfie images. The client chooses the file name (so a punch made offline can name its selfie before it is
 * uploaded) but the folder is fixed by who is signed in, so nobody can write into another person's or company's space.
 */
@Controller('files/selfies')
class FilesController {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, @Inject(STORAGE) private readonly storage: StorageProvider) {}

  @Put(':tenantId/:userId/:name') @HttpCode(200)
  async put(@Param() p: unknown, @Req() req: Request) {
    const a = params.parse(p);
    const auth = currentAuth();
    if (a.tenantId !== currentStore().tenantId || a.userId !== auth.userId) throw forbidden('You can only upload your own selfies.', 'not_your_file');
    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) throw unprocessable('Send the image as image/jpeg.', undefined, 'unsupported_media');
    if (body.length > MAX_SELFIE_BYTES) throw unprocessable('That image is too large.', undefined, 'file_too_large');
    if (body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) throw unprocessable('That is not a JPEG image.', undefined, 'unsupported_media');
    const key = selfieKeyFor(a.tenantId, a.userId, a.name.slice(0, -4));
    await this.storage.put(key, body);
    return { key };
  }

  /** The owner can view their own selfie; managers can view selfies attached to punches inside their scope. */
  @Get(':tenantId/:userId/:name')
  async get(@Param() p: unknown, @Res() res: Response) {
    const a = params.parse(p);
    if (a.tenantId !== currentStore().tenantId) throw notFound('File');
    const key = selfieKeyFor(a.tenantId, a.userId, a.name.slice(0, -4));
    if (a.userId !== currentAuth().userId) {
      const pred = this.scope.predicate(this.authz.require('attendance.punch.read'), sql`p.employee_id`);
      const ok = await this.db.q.execute(sql`select 1 from punches p where p.selfie_key = ${key} ${pred ? sql`and ${pred}` : sql``} limit 1`);
      if (!ok.rows.length) throw notFound('File');
    }
    const bytes = await this.storage.get(key);
    if (!bytes) throw notFound('File');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type('image/jpeg').send(bytes);
  }
}

@Module({
  controllers: [FilesController],
  providers: [{ provide: STORAGE, inject: [CONFIG], useFactory: (cfg: Config): StorageProvider => new LocalDiskStorage(cfg.FILES_DIR) }],
  exports: [STORAGE],
})
export class FilesModule {}
