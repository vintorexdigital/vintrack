'use client';
import { useQuery } from '@tanstack/react-query';
import { DataTable, EmptyState, PageBody, PageHeader, Select, StatusPill, type DataColumn } from '@trackrex/ui';
import { useState } from 'react';
import { api } from '@/shared/api/client';

interface Row { id: string; channel: string; to: string; template: string; subject: string | null; body: string; status: 'sent' | 'failed'; provider: string; error: string | null; createdAt: string; userName: string | null }
interface Result { data: Row[]; providers: { channel: string; provider: string; mock: boolean }[] }

export default function MessageLogPage() {
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['message-log', channel, status], queryFn: () => api<Result>('/v1/company/messages', { query: { channel, status, limit: 100 } }) });
  const mocks = q.data?.providers.filter((p) => p.mock && p.channel !== 'email') ?? [];
  const cols: DataColumn<Row>[] = [
    { key: 'at', header: 'When', numeric: true, cell: (r) => new Date(r.createdAt).toLocaleString() },
    { key: 'channel', header: 'Channel', cell: (r) => <span className="capitalize">{r.channel}</span> },
    { key: 'to', header: 'To', cell: (r) => <>{r.userName ?? '–'}<span className="ml-2 text-xs text-muted">{r.to.length > 28 ? `${r.to.slice(0, 26)}…` : r.to}</span></> },
    { key: 'msg', header: 'Message', cell: (r) => <span className="line-clamp-2 text-sm">{r.subject ? `${r.subject}. ` : ''}{r.body}</span> },
    { key: 'provider', header: 'Provider', cell: (r) => <>{r.provider}{r.provider.startsWith('mock') && <span className="ml-2"><StatusPill tone="late">Mock: not delivered</StatusPill></span>}</> },
    { key: 'status', header: 'Result', cell: (r) => (r.status === 'sent' ? <StatusPill tone="present">Sent</StatusPill> : <span title={r.error ?? ''}><StatusPill tone="absent">Failed</StatusPill></span>) },
  ];
  return (
    <>
      <PageHeader title="Message log" scope="Admin · Security" description="Every email, SMS, WhatsApp and push message sent to people, with the provider that handled it. Kept for 90 days." />
      <PageBody className="space-y-3">
        {mocks.length > 0 && (
          <p role="note" className="rounded-md border border-rule bg-pending-tint px-3 py-2 text-sm">
            {mocks.map((m) => m.channel.toUpperCase()).join(', ')} {mocks.length === 1 ? 'is' : 'are'} using a mock provider: messages are recorded here but not delivered to anyone. Connect a provider to send them for real.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-medium">Channel<Select className="mt-1.5 block" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="push">Push</option></Select></label>
          <label className="text-sm font-medium">Result<Select className="mt-1.5 block" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="sent">Sent</option><option value="failed">Failed</option></Select></label>
        </div>
        <DataTable caption="Message log" columns={cols} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} empty={<EmptyState title="No messages yet" hint="Messages appear here when people are notified." />} />
      </PageBody>
    </>
  );
}
