'use client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, type RequestOptions } from '../api/client';
import { useAuth } from '../auth/auth';
import type { Resource, Row } from './resource';

export interface ListPage { data: Row[]; nextCursor: string | null; total?: number }

/** Data hooks for one entity. Query keys include the company so switching company never shows stale rows. */
export function useCrudResource(r: Resource) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const base = (extra: unknown[] = []): QueryKey => ['crud', me?.company.id, r.kit.def.key, ...extra];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['crud', me?.company.id, r.kit.def.key] });

  return {
    key: base,
    useList: (params: URLSearchParams, enabled = true) =>
      useInfiniteQuery({
        queryKey: base(['list', params.toString()]),
        queryFn: ({ pageParam }) => api<ListPage>(r.apiPath, { query: new URLSearchParams([...params, ...(pageParam ? [['cursor', pageParam as string]] : [])]) }),
        initialPageParam: '' as string,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        enabled,
      }),
    useOne: (id: string | undefined) => useQuery({ queryKey: base(['one', id]), queryFn: () => api<Row>(`${r.apiPath}/${id}`), enabled: !!id }),
    useCreate: () => useMutation({ mutationFn: (body: unknown) => api<Row>(r.apiPath, { method: 'POST', body }), onSuccess: invalidate }),
    useUpdate: (id: string) => useMutation({ mutationFn: (body: unknown) => api<Row>(`${r.apiPath}/${id}`, { method: 'PATCH', body }), onSuccess: invalidate }),
    useRemove: () => useMutation({ mutationFn: (v: { id: string; reason?: string }) => api<Row>(`${r.apiPath}/${v.id}`, { method: 'DELETE', query: v.reason ? { reason: v.reason } : {} }), onSuccess: invalidate }),
    useRestore: () => useMutation({ mutationFn: (id: string) => api<Row>(`${r.apiPath}/${id}/restore`, { method: 'POST', body: {} }), onSuccess: invalidate }),
    useBulk: () => useMutation({ mutationFn: (b: { action: 'delete' | 'restore'; ids: string[]; reason?: string }) => api(`${r.apiPath}/bulk`, { method: 'POST', body: b }), onSuccess: invalidate }),
    useAction: <T = unknown>(path: (id: string) => string, method: RequestOptions['method'] = 'POST') =>
      useMutation({ mutationFn: (v: { id: string; body?: unknown }) => api<T>(path(v.id), { method, body: v.body ?? {} }), onSuccess: invalidate }),
    invalidate,
  };
}

/** Async option search for pickers: first page of `q` matches plus the current selection. */
export function useRefOptions(apiPath: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ref', apiPath, q],
    queryFn: () => api<ListPage>(apiPath, { query: { q, limit: 20, sort: '' } }),
    enabled,
    staleTime: 30_000,
  });
}
