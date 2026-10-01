'use client';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, PageBody, PageHeader, Skeleton } from '@trackrex/ui';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';

interface Emp { code: string; displayName: string; workEmail: string | null; mobile: string | null; dateOfJoining: string; status: string }

export default function ProfilePage() {
  const { me } = useAuth();
  const id = me?.membership.employeeId;
  const q = useQuery({ queryKey: ['my-employee', id], queryFn: () => api<Emp>(`/v1/people/employees/${id}`), enabled: !!id });
  return (
    <>
      <PageHeader title="Profile" scope="Employee" />
      <PageBody wide={false}>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[['Name', me?.user?.name], ['Email', me?.user?.email], ['Company', me?.company.name], ['Roles', me?.membership.roleKeys.join(', ')]].map(([l, v]) => <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="text-sm">{v ?? '–'}</dd></div>)}
        </dl>
        {id && (q.isLoading ? <Skeleton className="mt-6 h-24" /> : q.data ? (
          <section className="mt-6 border-t border-rule pt-4"><h2 className="mb-3 text-section font-semibold">Employment</h2>
            <dl className="grid gap-4 sm:grid-cols-2">{[['Employee code', q.data.code], ['Mobile', q.data.mobile], ['Joined', q.data.dateOfJoining], ['Status', q.data.status]].map(([l, v]) => <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="text-sm capitalize">{v ?? '–'}</dd></div>)}</dl>
          </section>
        ) : <EmptyState title="Employment details are not available" />)}
        <p className="mt-6 text-sm text-muted">Language and theme are in the account menu at the top right.</p>
      </PageBody>
    </>
  );
}
