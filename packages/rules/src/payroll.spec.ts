import { describe, expect, it } from 'vitest';
import { computePayslip, type SalaryStructure } from './payroll.js';

const base: SalaryStructure = { basic: 20000, hra: 8000, specialAllowance: 10000, otherAllowance: 0, pfEnabled: true, esiEnabled: false, professionalTax: 200, otherDeductions: 0 };

describe('computePayslip', () => {
  it('pays the full structure for a full month, with provident fund capped at the wage ceiling', () => {
    const p = computePayslip({ structure: base, cycleDays: 30, payableDays: 30 });
    expect(p.gross).toBe(38000);
    expect(p.deductions.find((d) => d.code === 'PF')!.amount).toBe(1800); // 12% of 15,000, not of 20,000
    expect(p.deductions.find((d) => d.code === 'PT')!.amount).toBe(200);
    expect(p.totalDeductions).toBe(2000);
    expect(p.net).toBe(36000);
    expect(p.lopDays).toBe(0);
    expect(p.employerContributions.find((d) => d.code === 'PF_ER')!.amount).toBe(1800);
    expect(p.warnings).toEqual([]);
  });

  it('prorates by payable days and shows loss of pay', () => {
    const p = computePayslip({ structure: base, cycleDays: 30, payableDays: 24 });
    expect(p.earnings.find((e) => e.code === 'BASIC')!.amount).toBe(16000);
    expect(p.earnings.find((e) => e.code === 'HRA')!.amount).toBe(6400);
    expect(p.gross).toBe(30400);
    expect(p.lopDays).toBe(6);
    // provident fund follows the basic actually earned (16,000 is above the ceiling)
    expect(p.deductions.find((d) => d.code === 'PF')!.amount).toBe(1800);
  });

  it('takes state insurance only while gross is within the limit, and says when it is not', () => {
    const low = computePayslip({ structure: { ...base, basic: 12000, hra: 4000, specialAllowance: 3000, pfEnabled: false, esiEnabled: true, professionalTax: 0 }, cycleDays: 30, payableDays: 30 });
    expect(low.gross).toBe(19000);
    expect(low.deductions.find((d) => d.code === 'ESI')!.amount).toBe(143); // ceil(19000 x 0.75%)
    expect(low.employerContributions.find((d) => d.code === 'ESI_ER')!.amount).toBe(618); // ceil(19000 x 3.25%)
    const high = computePayslip({ structure: { ...base, pfEnabled: false, esiEnabled: true }, cycleDays: 30, payableDays: 30 });
    expect(high.deductions.find((d) => d.code === 'ESI')).toBeUndefined();
    expect(high.warnings[0]).toMatch(/above 21000/);
  });

  it('adds overtime at twice the hourly rate of basic', () => {
    const p = computePayslip({ structure: { ...base, basic: 24000 }, cycleDays: 30, payableDays: 30, overtimeHours: 5 });
    // 24,000 / 30 days / 8 h = 100 an hour; double time for 5 h
    expect(p.earnings.find((e) => e.code === 'OT')!.amount).toBe(1000);
  });

  it('handles nothing payable and deductions that exceed pay without going negative', () => {
    const none = computePayslip({ structure: base, cycleDays: 30, payableDays: 0 });
    expect(none.gross).toBe(0);
    expect(none.net).toBe(0);
    expect(none.deductions).toEqual([]);
    expect(none.warnings).toContain('No payable days in this cycle.');
    const heavy = computePayslip({ structure: { ...base, otherDeductions: 90000 }, cycleDays: 30, payableDays: 30 });
    expect(heavy.net).toBe(0);
    expect(heavy.warnings).toContain('Deductions are more than the pay for this month.');
    const over = computePayslip({ structure: base, cycleDays: 30, payableDays: 31 });
    expect(over.payableDays).toBe(30);
    expect(over.warnings[0]).toMatch(/exceed/);
  });

  it('rounds to paise', () => {
    const p = computePayslip({ structure: { ...base, basic: 10001, hra: 0, specialAllowance: 0, pfEnabled: false, professionalTax: 0 }, cycleDays: 31, payableDays: 17 });
    expect(p.gross).toBe(5484.42); // 10,001 x 17 / 31
    expect(Number.isInteger(p.gross * 100)).toBe(true);
  });
});
