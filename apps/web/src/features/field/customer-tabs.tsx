'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, StatusPill } from '@trackrex/ui';
import Link from 'next/link';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import type { TabDef } from '@trackrex/ui';

interface Page<T> { data: T[] }
interface Contact { id: string; name: string; designation: string | null; phone: string | null; isPrimary: boolean }
interface Task { id: string; code: string; title: string; status: string; dueAt: string | null }

function ContactsTab({ customerId }: { customerId: string }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['customer-contacts', customerId], queryFn: () => api<Page<Contact>>('/v1/field/contacts', { query: { 'filter[customerId][eq]': customerId, limit: 100 } }) });
  return (
    <div className="space-y-3">
      {can('field.contact.create') && <Link href={`/field/contacts/new?customerId=${customerId}`}><Button variant="primary" size="sm">Add contact</Button></Link>}
      {q.data?.data.length === 0 ? <EmptyState title="No contacts yet" hint="Add the people you deal with here." /> : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data?.data.map((c) => <li key={c.id} className="flex min-h-11 items-center justify-between gap-2 px-1"><Link className="font-medium underline-offset-2 hover:underline" href={`/field/contacts/${c.id}`}>{c.name}</Link><span className="text-xs text-muted">{[c.designation, c.phone].filter(Boolean).join(' · ')}{c.isPrimary ? ' · Primary' : ''}</span></li>)}
        </ul>
      )}
    </div>
  );
}

function TasksTab({ customerId }: { customerId: string }) {
  const q = useQuery({ queryKey: ['customer-tasks', customerId], queryFn: () => api<Page<Task>>('/v1/field/tasks', { query: { 'filter[customerId][eq]': customerId, limit: 50 } }) });
  return q.data?.data.length === 0 ? <EmptyState title="No tasks for this customer" /> : (
    <ul className="divide-y divide-rule border-y border-rule">
      {q.data?.data.map((t) => <li key={t.id} className="flex min-h-11 items-center justify-between gap-2 px-1"><Link className="font-medium underline-offset-2 hover:underline" href={`/field/tasks/${t.id}`}>{t.title}</Link><StatusPill tone={t.status === 'completed' ? 'present' : t.status === 'cancelled' ? 'absent' : t.status === 'in_progress' ? 'pending' : 'non-working'}>{t.status.replace('_', ' ')}</StatusPill></li>)}
    </ul>
  );
}

export const CustomerTabs = (id: string): TabDef[] => [
  { value: 'contacts', label: 'Contacts', content: <ContactsTab customerId={id} /> },
  { value: 'tasks', label: 'Tasks', content: <TasksTab customerId={id} /> },
];
