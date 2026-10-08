import { Controller, Get, Module, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { ReportsService, type ReportResult } from './reports.service.js';

const cell = (type: string, v: string | number | null): string | number | null => (v === null || v === undefined ? null : type === 'hours' || type === 'number' || type === 'percent' ? Number(Number(v).toFixed(2)) : String(v));
const csvEscape = (v: unknown): string => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

@Controller('reports')
class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get() catalog() { return this.reports.catalog(); }
  @Get(':key') run(@Param('key') key: string, @Query() q: Record<string, unknown>) { return this.reports.run(key, q); }

  @Get(':key/export')
  async export(@Param('key') key: string, @Query() q: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const r: ReportResult = await this.reports.run(key, q);
    const name = `${r.report.key}-${r.params.from}-to-${r.params.to}`;
    const header = r.columns.map((c) => c.label);
    const body = r.rows.map((row) => r.columns.map((c) => cell(c.type, row[c.key] ?? null)));
    const total = r.totals ? [r.columns.map((c, i) => (i === 0 ? 'Total' : r.totals![c.key] ?? ''))] : [];
    if (q.format === 'csv') {
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      res.type('text/csv; charset=utf-8');
      return new StreamableFile(Buffer.from('﻿' + [header, ...body, ...total].map((line) => line.map(csvEscape).join(',')).join('\r\n')));
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(r.report.name.slice(0, 31));
    ws.addRow(header).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const line of [...body, ...total]) ws.addRow(line);
    if (total.length) ws.lastRow!.font = { bold: true };
    ws.columns.forEach((c, i) => { c.width = Math.max(12, Math.min(40, header[i]!.length + 4)); });
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return new StreamableFile(Buffer.from(await wb.xlsx.writeBuffer()));
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
