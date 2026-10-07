import { describe, expect, it } from 'vitest';
import { evaluateConditions, getPath, isPrivateHost, renderTemplate } from './workflow.js';

const ctx = { payload: { amount: 52000, currency: 'INR', tags: ['a', 'b'], note: 'Urgent Repair' }, employee: { departmentId: 'd1', name: 'Priya' } };

describe('conditions', () => {
  it('reads dotted paths and tolerates gaps', () => {
    expect(getPath(ctx, 'payload.amount')).toBe(52000);
    expect(getPath(ctx, 'payload.nope.deeper')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
  });
  it('compares numbers numerically even when they arrive as strings', () => {
    expect(evaluateConditions([{ path: 'payload.amount', op: 'gte', value: '50000' }], ctx).ok).toBe(true);
    expect(evaluateConditions([{ path: 'payload.amount', op: 'lt', value: 50000 }], ctx)).toMatchObject({ ok: false, failed: { op: 'lt' } });
    expect(evaluateConditions([{ path: 'payload.note', op: 'gt', value: 1 }], ctx).ok).toBe(false);
  });
  it('supports equals, not equals, contains, in and exists; all must hold', () => {
    expect(evaluateConditions([{ path: 'payload.currency', op: 'eq', value: 'INR' }, { path: 'employee.departmentId', op: 'in', value: ['d1', 'd2'] }], ctx).ok).toBe(true);
    expect(evaluateConditions([{ path: 'payload.currency', op: 'ne', value: 'INR' }], ctx).ok).toBe(false);
    expect(evaluateConditions([{ path: 'payload.note', op: 'contains', value: 'repair' }, { path: 'payload.tags', op: 'contains', value: 'b' }], ctx).ok).toBe(true);
    expect(evaluateConditions([{ path: 'payload.missing', op: 'exists' }], ctx).ok).toBe(false);
    expect(evaluateConditions([], ctx).ok).toBe(true);
  });
});

describe('templates', () => {
  it('fills placeholders and never evaluates anything', () => {
    expect(renderTemplate('{{employee.name}} claimed {{ payload.currency }} {{payload.amount}}{{payload.nothing}}', ctx)).toBe('Priya claimed INR 52000');
    expect(renderTemplate('{{constructor.constructor}}', ctx)).toBe('');
    expect(renderTemplate('${process.exit()} {{payload.tags}}', ctx)).toBe('${process.exit()} ["a","b"]');
  });
});

describe('private hosts', () => {
  it.each(['localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', 'fd00::1', 'metadata.google.internal', 'db.internal', 'printer.local', '::ffff:127.0.0.1'])('blocks %s', (h) => expect(isPrivateHost(h)).toBe(true));
  it.each(['example.com', '8.8.8.8', '172.32.0.1', 'hooks.slack.com'])('allows %s', (h) => expect(isPrivateHost(h)).toBe(false));
});
