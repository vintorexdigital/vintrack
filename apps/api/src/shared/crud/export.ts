import ExcelJS from 'exceljs';
import type { Row } from './crud.repository.js';

type Col = { key: string; label: string };

const cell = (v: unknown): string | number | boolean => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number | boolean;
};

/** Spreadsheet formulas in user data are neutralised so exports cannot run code when opened. */
const safe = (v: string | number | boolean): string | number | boolean =>
  typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

export function toCsv(columns: Col[], rows: Row[]): string {
  const esc = (v: string | number | boolean) => {
    const s = String(safe(v));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(cell(r[c.key]))).join(','))].join('\r\n') + '\r\n';
}

export async function toXlsx(sheet: string, columns: Col[], rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, Math.min(40, c.label.length + 6)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, safe(cell(r[c.key]))])));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
