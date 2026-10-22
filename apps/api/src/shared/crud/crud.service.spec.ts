import { buildListQuery, departments } from '@trackrex/schemas';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors.js';
import type { CrudRepository, ListResult, Row } from './crud.repository.js';
import { CrudService, type CrudDeps } from './crud.service.js';

const row = (index: number): Row => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, version: 1, name: `Department ${index}` });

function serviceWithRows(total: number): { service: CrudService; list: ReturnType<typeof vi.fn> } {
  const list = vi.fn(async (query: { limit: number }): Promise<ListResult> => ({
    rows: Array.from({ length: Math.min(total, query.limit) }, (_, index) => row(index + 1)),
    nextCursor: total > query.limit ? 'next' : null,
  }));
  const repo = { kit: departments, list } as unknown as CrudRepository;
  const noop = vi.fn();
  const deps = {
    repo,
    authz: { require: vi.fn(() => 'all') },
    scope: {},
    audit: { record: noop },
    sequences: {},
    outbox: {},
  } as unknown as CrudDeps;
  return { service: new CrudService(deps), list };
}

describe('CrudService export limits', () => {
  it('allows an export with exactly the maximum number of rows', async () => {
    const { service, list } = serviceWithRows(5);

    const result = await service.export(buildListQuery({}, departments), 5);

    expect(result.rows).toHaveLength(5);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ limit: 6, includeTotal: false }), undefined);
  });

  it('rejects an export only when it exceeds the maximum', async () => {
    const { service } = serviceWithRows(6);

    await expect(service.export(buildListQuery({}, departments), 5)).rejects.toMatchObject({
      status: 422,
      code: 'export_too_large',
    } satisfies Partial<AppError>);
  });
});
