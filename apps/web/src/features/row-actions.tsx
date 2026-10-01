'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/shared/api/client';
import type { MenuItem } from '@trackrex/ui';
import { Check, Send, UserMinus, X, Ban, Rocket, GitBranch } from 'lucide-react';
import type { Row, ResourceContext } from '@/shared/crud/resource';

async function run(path: string, body: unknown, ctx: ResourceContext) {
  try { await api(path, { method: 'POST', body }); } finally { ctx.reload(); }
}
const ask = (msg: string) => (typeof window === 'undefined' ? null : window.prompt(msg));

export function EmployeeActions(row: Row, ctx: ResourceContext): MenuItem[] {
  const out: MenuItem[] = [];
  if (ctx.can('hr.employee.invite') && row.status !== 'exited') out.push({ label: 'Send invitation', icon: <Send className="size-4" aria-hidden />, onSelect: () => void run(`/v1/people/employees/${row.id}/invite`, {}, ctx).then(() => window.alert('Invitation sent.')).catch((e: Error) => window.alert(e.message)) });
  if (ctx.can('hr.employee.exit') && row.status !== 'exited') out.push({ label: 'Exit employee', icon: <UserMinus className="size-4" aria-hidden />, onSelect: () => { const d = ask('Date of exit (YYYY-MM-DD)'); if (d) void run(`/v1/people/employees/${row.id}/exit`, { dateOfExit: d }, ctx).catch((e: Error) => window.alert(e.message)); } });
  return out;
}

export function ApprovalActions(kind: 'leave' | 'regularization', row: Row, ctx: ResourceContext): MenuItem[] {
  const base = kind === 'leave' ? `/v1/leave/requests/${row.id}` : `/v1/attendance/regularizations/${row.id}`;
  const perm = kind === 'leave' ? 'leave.request.approve' : 'attendance.regularization.approve';
  const fail = (e: Error) => window.alert(e.message);
  const out: MenuItem[] = [];
  if (row.status === 'pending' && ctx.can(perm)) {
    out.push({ label: kind === 'leave' ? 'Approve leave' : 'Approve request', icon: <Check className="size-4" aria-hidden />, onSelect: () => void run(`${base}/approve`, {}, ctx).catch(fail) });
    out.push({ label: 'Reject', icon: <X className="size-4" aria-hidden />, onSelect: () => { const c = ask('Reason for rejecting'); if (c) void run(`${base}/reject`, { comment: c }, ctx).catch(fail); } });
  }
  if (row.status === 'pending' || row.status === 'approved') out.push({ label: 'Cancel request', icon: <Ban className="size-4" aria-hidden />, onSelect: () => void run(`${base}/cancel`, {}, ctx).catch(fail) });
  return out;
}

export function TaskActions(row: Row, ctx: ResourceContext): MenuItem[] {
  if (row.status === 'completed' || row.status === 'cancelled' || !ctx.can('field.task.update')) return [];
  return [{ label: 'Cancel task', icon: <Ban className="size-4" aria-hidden />, onSelect: () => { const c = ask('Reason for cancelling'); if (c) void run(`/v1/field/tasks/${row.id}/cancel`, { reason: c }, ctx).catch((e: Error) => window.alert(e.message)); } }];
}

export function PolicyActions(row: Row, ctx: ResourceContext): MenuItem[] {
  const fail = (e: Error) => window.alert(e.message);
  const out: MenuItem[] = [];
  if (row.state === 'draft' && ctx.can('attendance.policy.publish')) out.push({ label: 'Publish policy', icon: <Rocket className="size-4" aria-hidden />, onSelect: () => { if (window.confirm('Publishing makes this version immutable. Continue?')) void run(`/v1/attendance/policies/${row.id}/publish`, {}, ctx).catch(fail); } });
  if (row.state === 'published' && ctx.can('attendance.policy.create')) out.push({ label: 'Create new version', icon: <GitBranch className="size-4" aria-hidden />, onSelect: () => { const d = ask('New version starts on (YYYY-MM-DD)'); if (d) void run(`/v1/attendance/policies/${row.id}/new-version`, { startDate: d }, ctx).catch(fail); } });
  return out;
}

export { useRouter };
