import { describe, expect, it } from 'vitest';
import { departments, employees, workLocations, buildListQuery, toSearchParams, encodeCursor, decodeCursor, QueryError } from './index.js';

describe('defineEntity', () => {
  it('derives create, update and read schemas from the field list', () => {
    const ok = departments.createSchema.parse({ name: ' Sales ' });
    expect(ok).toMatchObject({ name: 'Sales', status: 'active' });
    expect(departments.createSchema.safeParse({}).success).toBe(false);
    expect(departments.createSchema.safeParse({ name: 'x', extra: 1 }).success).toBe(false);
    expect(departments.updateSchema.parse({})).toEqual({});
    expect(departments.updateSchema.safeParse({ status: 'gone' }).success).toBe(false);
  });
  it('validates typed fields', () => {
    const base = { firstName: 'A', displayName: 'A', dateOfJoining: '2026-01-05' };
    expect(employees.createSchema.safeParse({ ...base, mobile: '98765' }).success).toBe(false);
    expect(employees.createSchema.safeParse({ ...base, mobile: '+919876543210', workEmail: 'A@Example.com' }).success).toBe(true);
    expect(employees.createSchema.parse({ ...base, workEmail: 'A@Example.com' }).workEmail).toBe('a@example.com');
    expect(employees.createSchema.safeParse({ ...base, dateOfJoining: '05/01/2026' }).success).toBe(false);
    expect(workLocations.createSchema.safeParse({ name: 'HQ', latitude: 120 }).success).toBe(false);
  });
  it('exposes columns, form fields and permissions', () => {
    expect(departments.columns.find((c) => c.key === 'name')).toMatchObject({ sortable: true, defaultVisible: true });
    expect(departments.permissions.read).toBe('org.department.read');
    expect(employees.formFields.some((f) => f.key === 'homeLatitude')).toBe(false);
    expect(employees.searchable).toContain('displayName');
  });
});

describe('list queries', () => {
  it('parses sort, filters, paging and totals', () => {
    const q = buildListQuery({
      limit: '25', sort: '-display_name,dateOfJoining', include_total: 'true', q: ' ravi ',
      'filter[status][in]': 'active,invited', 'filter[dateOfJoining][between]': '2026-01-01,2026-12-31', deleted: 'only',
    }, employees);
    expect(q.limit).toBe(25);
    expect(q.sort).toEqual([{ field: 'displayName', dir: 'desc' }, { field: 'dateOfJoining', dir: 'asc' }]);
    expect(q.filters).toEqual([
      { field: 'status', op: 'in', value: ['active', 'invited'] },
      { field: 'dateOfJoining', op: 'between', value: ['2026-01-01', '2026-12-31'] },
    ]);
    expect(q).toMatchObject({ includeTotal: true, q: 'ravi', deleted: 'only' });
  });
  it('accepts nested filter objects as parsed by Express', () => {
    const q = buildListQuery({ filter: { status: { eq: 'active' }, departmentId: 'abc' } }, employees);
    expect(q.filters).toHaveLength(2);
  });
  it('rejects unknown fields, operators and bad values', () => {
    expect(() => buildListQuery({ sort: 'nope' }, employees)).toThrow(QueryError);
    expect(() => buildListQuery({ 'filter[nope][eq]': '1' }, employees)).toThrow(/Cannot filter/);
    expect(() => buildListQuery({ 'filter[status][gt]': '1' }, employees)).toThrow(/does not support/);
    expect(() => buildListQuery({ 'filter[dateOfJoining][between]': '2026-01-01' }, employees)).toThrow(/two/);
    expect(() => buildListQuery({ limit: '0' }, employees)).toThrow(/positive/);
    expect(() => buildListQuery({ deleted: 'x' }, employees)).toThrow(/deleted/);
  });
  it('caps the page size and defaults the sort', () => {
    const q = buildListQuery({ limit: '5000' }, departments);
    expect(q.limit).toBe(100);
    expect(q.sort).toEqual([{ field: 'name', dir: 'asc' }]);
  });
  it('round-trips through URL params and cursors', () => {
    const q = buildListQuery({ sort: '-displayName', 'filter[status][in]': 'active,invited', q: 'a b' }, employees);
    const params = toSearchParams(q);
    const back = buildListQuery(Object.fromEntries(params), employees);
    expect(back.filters).toEqual(q.filters);
    expect(back.sort).toEqual(q.sort);
    const c = encodeCursor(['x y', 5], 'id-1');
    expect(decodeCursor(c)).toEqual({ v: ['x y', 5], id: 'id-1' });
    expect(() => decodeCursor('###')).toThrow(QueryError);
  });
});
