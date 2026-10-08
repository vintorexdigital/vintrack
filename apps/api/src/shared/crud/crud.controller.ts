import { Body, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { idParam, type Page, uuid } from '@trackrex/schemas';
import { CrudService } from './crud.service.js';
import type { Row } from './crud.repository.js';
import { toCsv, toXlsx } from './export.js';

const bulkBody = z.object({
  action: z.enum(['delete', 'restore', 'update']),
  ids: z.array(uuid).min(1).max(200),
  reason: z.string().max(500).optional(),
  patch: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Routes shared by every CRUD entity. Controllers hold no logic: validation and authorization
 * happen in the service. Subclasses add only custom actions.
 */
export abstract class CrudController {
  constructor(protected readonly service: CrudService) {}

  @Get()
  async list(@Query() query: Record<string, unknown>): Promise<Page<Row>> {
    const result = await this.service.list(this.service.parseQuery(query));
    return { data: result.rows, nextCursor: result.nextCursor, ...(result.total !== undefined ? { total: result.total } : {}) };
  }

  @Get('export')
  async export(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): Promise<StreamableFile | string> {
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { columns, rows } = await this.service.export(this.service.parseQuery(query));
    const name = this.service.kit.def.key;
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.${format}"`);
    if (format === 'xlsx') {
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return new StreamableFile(await toXlsx(this.service.kit.def.plural, columns, rows));
    }
    res.type('text/csv; charset=utf-8');
    return toCsv(columns, rows);
  }

  @Post('bulk')
  @HttpCode(200)
  async bulk(@Body() body: unknown): Promise<{ results: { id: string; ok: true }[] }> {
    const b = bulkBody.parse(body);
    return { results: await this.service.bulk(b.action, b.ids, { ...(b.reason ? { reason: b.reason } : {}), ...(b.patch ? { patch: b.patch } : {}) }) };
  }

  @Get(':id')
  get(@Param() p: unknown): Promise<Row> {
    return this.service.get(idParam.parse(p).id);
  }

  @Post()
  create(@Body() body: unknown): Promise<Row> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param() p: unknown, @Body() body: unknown): Promise<Row> {
    return this.service.update(idParam.parse(p).id, body);
  }

  @Delete(':id')
  remove(@Param() p: unknown, @Query('reason') reason?: string): Promise<Row> {
    return this.service.remove(idParam.parse(p).id, reason);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param() p: unknown): Promise<Row> {
    return this.service.restore(idParam.parse(p).id);
  }
}
