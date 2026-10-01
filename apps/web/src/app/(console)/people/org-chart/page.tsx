'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, EmptyState, PageBody, PageHeader, Skeleton } from '@trackrex/ui';
import Link from 'next/link';
import { useMemo } from 'react';
import { api } from '@/shared/api/client';

interface Node { id: string; code: string; displayName: string; managerId: string | null }

function Branch({ node, kids, depth }: { node: Node; kids: Map<string | null, Node[]>; depth: number }) {
  const children = kids.get(node.id) ?? [];
  const row = (
    <span className="flex items-center gap-2"><Avatar name={node.displayName} size={24} /><Link href={`/people/employees/${node.id}`} className="font-medium text-ink no-underline hover:underline">{node.displayName}</Link><span className="text-xs tabular-nums text-muted">{node.code}</span>{children.length > 0 && <span className="text-xs text-muted">{children.length} direct</span>}</span>
  );
  if (!children.length) return <li className="py-1">{row}</li>;
  return (
    <li>
      <details open={depth < 2}>
        <summary className="cursor-pointer py-1">{row}</summary>
        <ul className="ml-4 border-l border-rule pl-3">{children.map((c) => <Branch key={c.id} node={c} kids={kids} depth={depth + 1} />)}</ul>
      </details>
    </li>
  );
}

export default function OrgChartPage() {
  const q = useQuery({ queryKey: ['org-chart'], queryFn: () => api<Node[]>('/v1/people/employees/org-chart') });
  const { roots, kids } = useMemo(() => {
    const kids = new Map<string | null, Node[]>();
    const ids = new Set(q.data?.map((n) => n.id));
    for (const n of q.data ?? []) { const k = n.managerId && ids.has(n.managerId) ? n.managerId : null; kids.set(k, [...(kids.get(k) ?? []), n]); }
    return { roots: kids.get(null) ?? [], kids };
  }, [q.data]);
  return (
    <>
      <PageHeader title="Org chart" scope="People" description="Reporting lines. Open a branch to see who reports to whom." />
      <PageBody>{q.isLoading ? <Skeleton className="h-64" /> : roots.length === 0 ? <EmptyState title="No employees yet" /> : <ul className="space-y-0.5 text-sm">{roots.map((r) => <Branch key={r.id} node={r} kids={kids} depth={0} />)}</ul>}</PageBody>
    </>
  );
}
