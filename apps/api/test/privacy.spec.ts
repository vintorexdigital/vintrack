import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { world, type World } from './fixtures.js';
import { boot, type Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

const download = (auth: Record<string, string>) => h.api.get('/v1/company/export').set(auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });

describe('company data export', () => {
  it('gives the owner every table of their company and nothing of anyone else', async () => {
    await w.employee('Export Ezra');
    const other = await world(h);
    await other.employee('Other Company Person');
    const r = await download(w.co.auth);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as Buffer);
    const names = wb.worksheets.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['employees', 'departments', 'shifts', 'leave_types', 'audit_log', 'punches']));
    const emp = wb.getWorksheet('employees')!;
    const header = (emp.getRow(1).values as unknown[]).slice(1) as string[];
    expect(header).not.toContain('tenant_id');
    const col = header.indexOf('display_name') + 1;
    const people = emp.getColumn(col).values.slice(2).map(String);
    expect(people).toContain('Export Ezra');
    expect(people).not.toContain('Other Company Person');
    const audit = await h.api.get('/v1/audit?entity=company&action=exported').set(w.co.auth);
    expect(audit.status).toBe(200);
  });

  it('is refused to people without the permission', async () => {
    const e = await w.join(await w.employee('No Export'));
    expect((await download(e.auth)).status).toBe(403);
    const m = await w.join(await w.employee('Mgr No Export'), ['manager']);
    expect((await download(m.auth)).status).toBe(403);
  });
});
