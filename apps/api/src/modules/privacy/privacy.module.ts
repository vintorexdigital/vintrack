import { Controller, Get, HttpCode, Injectable, Module, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { sql } from 'drizzle-orm';
import { ALL_KITS } from '@trackrex/schemas';
import { AuditService } from '../../core/audit.service.js';
import { currentStore } from '../../core/context.js';
import { EnvelopeService, PURPOSE } from '../../core/crypto/envelope.service.js';
import { Db } from '../../core/database/db.service.js';
import { Authz } from '../../core/rbac.service.js';
import { tableNameFor } from '../../shared/crud/entity-sql.js';

const MAX_ROWS = 50_000;
/** Company data that is not a CRUD entity. Row-level security keeps every one of these to the signed-in company. */
const EXTRA_TABLES = ['employee_private', 'call_sessions', 'report_schedules', 'report_snapshots', 'task_forms', 'workflow_runs', 'workflow_approvals', 'approval_progress', 'approval_steps', 'punches', 'breaks', 'attendance_days', 'leave_ledger', 'shift_assignments', 'devices', 'live_locations', 'notifications', 'feed_events'];
const BIG_TABLES = ['location_pings', 'activity_buckets', 'audit_log'];
/** Sealed values are opened for the company's own export; the sealed column itself is not exported. */
const SEALED: Record<string, { purpose: string; into: [string, string] }> = {
  location_pings: { purpose: PURPOSE.locationPoint, into: ['latitude', 'longitude'] },
  live_locations: { purpose: PURPOSE.liveLocation, into: ['latitude', 'longitude'] },
  employee_private: { purpose: PURPOSE.employeeHome, into: ['home_latitude', 'home_longitude'] },
};

const cell = (v: unknown): string | number | boolean | Date | null => (v === null || v === undefined ? null : v instanceof Date || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' ? v : JSON.stringify(v));

/**
 * The company's right to take its data away. One workbook, one sheet per table, everything the company owns and
 * nothing of other companies (row-level security) or of the platform (user passwords and sessions are not here).
 */
@Injectable()
export class CompanyExportService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly audit: AuditService, private readonly envelope: EnvelopeService) {}

  async build(): Promise<{ buffer: Buffer; tables: number; truncated: string[] }> {
    this.authz.require('company.export');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Trackrex';
    wb.created = new Date();
    const truncated: string[] = [];
    const names = [...new Set([...ALL_KITS.map(tableNameFor), ...EXTRA_TABLES, ...BIG_TABLES])];
    let tables = 0;
    for (const t of names) {
      const res = await this.db.q.execute(sql`select * from ${sql.identifier(t)} limit ${MAX_ROWS + 1}`).catch(() => null);
      if (!res) continue;
      const rows = res.rows as Record<string, unknown>[];
      const over = rows.length > MAX_ROWS;
      if (over) { rows.length = MAX_ROWS; truncated.push(t); }
      const seal = SEALED[t];
      const sealedCol = t === 'employee_private' ? 'home_sealed' : 'sealed';
      if (seal) {
        for (const r of rows) {
          const v = r[sealedCol] as string | null;
          if (!v) continue;
          const p = await this.envelope.openPoint(seal.purpose, v);
          r[seal.into[0]] = p.lat;
          r[seal.into[1]] = p.lng;
        }
      }
      const cols = [...res.fields.map((f) => f.name), ...(seal && !res.fields.some((f) => f.name === seal.into[0]) ? seal.into : [])].filter((c) => c !== 'tenant_id' && c !== sealedCol);
      const ws = wb.addWorksheet(t.slice(0, 31));
      ws.addRow(cols).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      for (const r of rows) ws.addRow(cols.map((c) => cell(r[c])));
      tables++;
    }
    if (truncated.length) {
      const ws = wb.addWorksheet('README');
      ws.addRow([`These tables were cut at ${MAX_ROWS.toLocaleString()} rows: ${truncated.join(', ')}. Ask support for a complete export.`]);
    }
    await this.audit.record({ entity: 'company', entityId: currentStore().tenantId!, action: 'exported', changes: { tables: { new: tables } } });
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), tables, truncated };
  }
}

@Controller('company/export')
class CompanyExportController {
  constructor(private readonly svc: CompanyExportService) {}
  @Get()
  async download(@Res({ passthrough: true }) res: Response) {
    const { buffer } = await this.svc.build();
    res.setHeader('Content-Disposition', `attachment; filename="company-export-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return new StreamableFile(buffer);
  }
}

/** What protects the company's sensitive data, and the one action an admin can take: start a new data key. */
@Controller('company/encryption')
class EncryptionController {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly envelope: EnvelopeService, private readonly audit: AuditService) {}

  @Get()
  async status() {
    this.authz.require('company.encryption.manage');
    const keys = (await this.db.q.execute(sql`select version, kms_key_id as "kmsKeyId", created_at as "createdAt", retired_at as "retiredAt" from tenant_keys order by version desc`)).rows;
    const unsealed = (await this.db.q.execute(sql`select (select count(*) from location_pings where sealed is null)::int as pings, (select count(*) from employees where home_latitude is not null)::int as homes`)).rows[0] as { pings: number; homes: number };
    return { enabled: this.envelope.enabled, keyService: this.envelope.kms.name, sealed: ['Home location', 'Location history and live position', 'Selfie images'], notSealed: ['Punch coordinates (needed for attendance reports)', 'Customer addresses and task check-in positions'], keys, pendingSeal: unsealed };
  }

  @Post('rotate') @HttpCode(200)
  async rotate() {
    this.authz.require('company.encryption.manage');
    const version = await this.envelope.rotate();
    await this.audit.record({ entity: 'company', entityId: currentStore().tenantId!, action: 'data_key_rotated', changes: { version: { new: version } } });
    return { version };
  }
}

@Module({ controllers: [CompanyExportController, EncryptionController], providers: [CompanyExportService] })
export class PrivacyModule {}
