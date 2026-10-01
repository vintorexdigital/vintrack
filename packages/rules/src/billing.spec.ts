import { describe, expect, it } from 'vitest';
import { buildInvoice, dunningAction, monthPeriod, taxRateBpsFor } from './billing.js';

describe('billing', () => {
  it('builds an invoice with GST on seats times price', () => {
    const d = buildInvoice({ planName: 'Field', seats: 25, unitMinor: 14_900, periodStart: '2026-03-01', periodEnd: '2026-03-31', taxRateBps: taxRateBpsFor('IN') });
    expect(d.subtotalMinor).toBe(372_500);
    expect(d.taxMinor).toBe(67_050);
    expect(d.totalMinor).toBe(439_550);
    expect(d.lines).toHaveLength(1);
  });
  it('rounds tax to whole minor units', () => {
    expect(buildInvoice({ planName: 'x', seats: 1, unitMinor: 333, periodStart: 'a', periodEnd: 'b', taxRateBps: 1800 }).taxMinor).toBe(60);
  });
  it('charges no tax outside India and rejects bad input', () => {
    expect(taxRateBpsFor('US')).toBe(0);
    expect(() => buildInvoice({ planName: 'x', seats: 0, unitMinor: 1, periodStart: 'a', periodEnd: 'b', taxRateBps: 0 })).toThrow();
    expect(() => buildInvoice({ planName: 'x', seats: 1, unitMinor: 1.5, periodStart: 'a', periodEnd: 'b', taxRateBps: 0 })).toThrow();
  });
  it('finds month boundaries including leap February', () => {
    expect(monthPeriod('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthPeriod('2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
  it('escalates dunning at 7 and 30 days', () => {
    expect([0, 6, 7, 29, 30, 90].map(dunningAction)).toEqual(['none', 'none', 'past_due', 'past_due', 'suspend', 'suspend']);
  });
});
