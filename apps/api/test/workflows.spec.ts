import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { callWebhook } from '../src/modules/workflows/webhook.js';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
let jobs: JobsService;
let cat: Record<string, string>;
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  h = await boot(); w = await world(h); jobs = h.app.get(JobsService);
  cat = Object.fromEntries((await h.api.get('/v1/admin/expenses/categories?limit=50').set(w.co.auth)).body.data.map((x: { name: string; id: string }) => [x.name, x.id]));
});
afterAll(async () => { await h.close(); await owner.end(); });

const today = () => new Date().toISOString().slice(0, 10);
const setting = (key: string, value: unknown) => h.api.put(`/v1/settings/${key}`).set(w.co.auth).send({ value });
const claim = async (s: { auth: Record<string, string> }, empId: string, amount: number) => (await h.api.post('/v1/expenses/claims').set(s.auth).send({ employeeId: empId, categoryId: cat.Travel, expenseDate: today(), amount })).body.id as string;
const approve = (id: string, auth: Record<string, string>, body: Record<string, unknown> = {}) => h.api.post(`/v1/expenses/claims/${id}/approve`).set(auth).send(body);
const status = async (id: string) => (await h.api.get(`/v1/expenses/claims/${id}`).set(w.co.auth)).body.status as string;

async function chain(levels: number) {
  await setting('approvals.expense_levels', levels);
  const director = await w.employee('Chain Director');
  const manager = await w.employee('Chain Manager', { reportingManagerId: director.id });
  const emp = await w.employee('Chain Employee', { reportingManagerId: manager.id });
  return { director, manager, emp, d: await w.join(director, ['manager']), m: await w.join(manager, ['manager']), s: await w.join(emp) };
}

describe('multi-level approvals', () => {
  it('passes a claim up the reporting line and finishes only at the last level', async () => {
    const c = await chain(2);
    const id = await claim(c.s, c.emp.id, 800);
    const first = await approve(id, c.m.auth, { comment: 'Looks right' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'pending', approval: { final: false, level: 1, levels: 2 } });
    expect(await status(id)).toBe('pending');

    // the next approver is told; the same manager cannot approve again; a stranger cannot either
    await jobs.run('outbox-relay');
    expect(((await h.api.get('/v1/notifications').set(c.d.auth)).body.data as { title: string }[]).some((n) => /needs your approval \(step 2 of 2\)/.test(n.title))).toBe(true);
    expect((await approve(id, c.m.auth)).body.code).toBe('not_your_level');
    const stranger = await w.join(await w.employee('Chain Stranger'), ['manager']);
    expect((await approve(id, stranger.auth)).status).toBe(404); // outside their scope, so it does not exist for them

    const trail = await h.api.get(`/v1/approvals/expense/${id}`).set(c.d.auth);
    expect(trail.body).toMatchObject({ levels: 2, waitingFor: { level: 2, name: 'Chain Director' }, steps: [{ level: 1, decision: 'approved', by: 'Chain Manager', override: false }] });

    const last = await approve(id, c.d.auth, { approvedAmount: 700 });
    expect(last.body).toMatchObject({ status: 'approved', approvedAmount: 700 });
    expect((await h.api.get(`/v1/approvals/expense/${id}`).set(c.d.auth)).body).toMatchObject({ waitingFor: null, steps: [{ level: 1 }, { level: 2 }] });
  });

  it('lets any level reject, and lets a company-wide approver step in as a recorded override', async () => {
    const c = await chain(2);
    const a = await claim(c.s, c.emp.id, 500);
    expect((await h.api.post(`/v1/expenses/claims/${a}/reject`).set(c.m.auth).send({ comment: 'Not allowed' })).body.status).toBe('rejected');
    const b = await claim(c.s, c.emp.id, 500);
    expect((await approve(b, w.co.auth)).body).toMatchObject({ status: 'pending', approval: { final: false } });
    expect((await approve(b, w.co.auth)).body.status).toBe('approved');
    const steps = (await h.api.get(`/v1/approvals/expense/${b}`).set(w.co.auth)).body.steps as { override: boolean }[];
    expect(steps.map((x) => x.override)).toEqual([true, true]);
  });

  it('decides the levels once, so changing the setting leaves requests in flight alone, and never asks for more levels than there are managers', async () => {
    const c = await chain(2);
    const id = await claim(c.s, c.emp.id, 300);
    await approve(id, c.m.auth);
    await setting('approvals.expense_levels', 1);
    expect((await approve(id, c.d.auth)).body.status).toBe('approved'); // still needed level 2
    // three levels wanted, but this person has only one manager above them
    await setting('approvals.expense_levels', 3);
    const solo = await w.employee('Solo Boss');
    const rep = await w.employee('Solo Rep', { reportingManagerId: solo.id });
    const sb = await w.join(solo, ['manager']);
    const sr = await w.join(rep);
    const one = await claim(sr, rep.id, 100);
    expect((await approve(one, sb.auth)).body.status).toBe('approved');
    await setting('approvals.expense_levels', 1);
  });

  it('can ask for an extra level on large claims only', async () => {
    const c = await chain(1);
    await setting('approvals.expense_extra_level_from', 5000);
    const small = await claim(c.s, c.emp.id, 4000);
    expect((await approve(small, c.m.auth)).body.status).toBe('approved');
    const big = await claim(c.s, c.emp.id, 9000);
    expect((await approve(big, c.m.auth)).body).toMatchObject({ status: 'pending', approval: { levels: 2 } });
    expect((await approve(big, c.d.auth)).body.status).toBe('approved');
    await setting('approvals.expense_extra_level_from', 0);
  });

  it('works the same way for leave requests', async () => {
    await setting('approvals.leave_levels', 2);
    const director = await w.employee('Leave Director');
    const manager = await w.employee('Leave Manager', { reportingManagerId: director.id });
    const emp = await w.employee('Leave Employee', { reportingManagerId: manager.id });
    const d = await w.join(director, ['manager']);
    const m = await w.join(manager, ['manager']);
    const s = await w.join(emp);
    const lop = (await h.api.get('/v1/leave/types').set(s.auth)).body.data.find((t: { code: string }) => t.code === 'LOP');
    const day = new Date(Date.now() + 40 * 86_400_000);
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const iso = day.toISOString().slice(0, 10);
    const req = await h.api.post('/v1/leave/requests').set(s.auth).send({ employeeId: emp.id, leaveTypeId: lop.id, fromDate: iso, toDate: iso });
    expect(req.status).toBe(201);
    const l1 = await h.api.post(`/v1/leave/requests/${req.body.id}/approve`).set(m.auth).send({});
    expect(l1.body).toMatchObject({ status: 'pending', approval: { level: 1, levels: 2 } });
    expect((await h.api.post(`/v1/leave/requests/${req.body.id}/approve`).set(d.auth).send({})).body.status).toBe('approved');
    await setting('approvals.leave_levels', 1);
  });
});

describe('workflows', () => {
  const wf = (over: Record<string, unknown>) => h.api.post('/v1/automation/workflows').set(w.co.auth).send({
    name: `Flow ${Math.random().toString(36).slice(2, 7)}`, status: 'active', trigger: 'expense.submitted', conditions: [], steps: [{ type: 'notify', to: { kind: 'manager' }, title: 'hello' }], ...over,
  });
  const runsOf = async (workflowId: string) => (await h.api.get(`/v1/automation/runs?workflowId=${workflowId}`).set(w.co.auth)).body.data as { id: string; status: string; error: string | null; log: { type: string; result: string }[]; resumeAt: string | null }[];

  it('is built by admins, validated, and closed to employees', async () => {
    const ok = await wf({ steps: [{ type: 'notify', to: { kind: 'manager' }, title: 'x' }] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect((await wf({ steps: [] })).status).toBe(422);
    expect((await wf({ steps: [{ type: 'webhook', url: 'http://insecure.example.com/x' }] })).status).toBe(422);
    expect((await wf({ trigger: 'nothing.happens' })).status).toBe(422);
    expect((await wf({ conditions: [{ path: 'secrets.token', op: 'eq', value: 'x' }] })).status).toBe(422);
    const e = await w.join(await w.employee('Flow Employee'));
    expect((await h.api.post('/v1/automation/workflows').set(e.auth).send({ name: 'No', trigger: 'task.assigned', steps: [{ type: 'delay', minutes: 5 }] })).status).toBe(403);
    expect((await h.api.get('/v1/automation/runs').set(e.auth)).status).toBe(403);
  });

  it('runs only when the event matches and the conditions hold, notifies, creates a task, and waits for an approval', async () => {
    const mgr = await w.employee('Wf Manager');
    const emp = await w.employee('Wf Employee', { reportingManagerId: mgr.id });
    const fin = await w.employee('Wf Finance');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const f = await w.join(fin, ['manager']);
    const flow = (await wf({
      name: 'Large claim review',
      conditions: [{ path: 'payload.amount', op: 'gte', value: 50000 }],
      steps: [
        { type: 'notify', to: { kind: 'manager' }, title: '{{employee.name}} claimed {{payload.currency}} {{payload.amount}}', body: 'Over the review limit' },
        { type: 'approval', approver: { kind: 'employee', employeeId: fin.id }, title: 'Finance sign-off for {{employee.name}}' },
        { type: 'create_task', assignTo: { kind: 'subject_employee' }, title: 'Attach the invoice for your large claim', dueInHours: 48, priority: 'high' },
      ],
    })).body;

    const small = await claim(s, emp.id, 1000);
    const large = await claim(s, emp.id, 60000);
    await jobs.run('outbox-relay');
    await jobs.run('outbox-relay'); // a second pass must not run it twice
    const runs = await runsOf(flow.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'waiting' });
    expect(runs[0]!.log.map((l) => l.type)).toEqual(['notify', 'approval']);
    void small; void large;

    const told = (await h.api.get('/v1/notifications').set(m.auth)).body.data as { title: string; type: string }[];
    expect(told.some((n) => n.type === 'workflow.notice' && n.title === 'Wf Employee claimed INR 60000')).toBe(true);

    // only the named approver can decide
    const inbox = (await h.api.get('/v1/automation/approvals').set(f.auth)).body.data as { id: string; title: string }[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.title).toBe('Finance sign-off for Wf Employee');
    expect((await h.api.get('/v1/automation/approvals').set(m.auth)).body.data).toHaveLength(0);
    expect((await h.api.post(`/v1/automation/approvals/${inbox[0]!.id}/decide`).set(m.auth).send({ decision: 'approved' })).status).toBe(403);
    expect((await h.api.post(`/v1/automation/approvals/${inbox[0]!.id}/decide`).set(f.auth).send({ decision: 'approved', comment: 'Fine' })).body.status).toBe('approved');
    expect((await h.api.post(`/v1/automation/approvals/${inbox[0]!.id}/decide`).set(f.auth).send({ decision: 'approved' })).status).toBe(409);

    const after = await runsOf(flow.id);
    expect(after[0]!.status).toBe('completed');
    expect(after[0]!.log.map((l) => l.type)).toEqual(['notify', 'approval', 'approval', 'create_task']);
    const tasks = (await h.api.get('/v1/field/tasks').set(s.auth)).body.data as { title: string; priority: string; assigneeId: string }[];
    expect(tasks.find((t) => t.title === 'Attach the invoice for your large claim')).toMatchObject({ priority: 'high', assigneeId: emp.id });

    // the task a workflow created does not start workflows of its own
    const loop = (await wf({ trigger: 'task.assigned', steps: [{ type: 'notify', to: { kind: 'subject_employee' }, title: 'task!' }] })).body;
    await jobs.run('outbox-relay');
    expect((await runsOf(loop.id)).length).toBe(0);
    const direct = await h.api.post('/v1/field/tasks').set(m.auth).send({ title: 'Plain task', assigneeId: emp.id });
    expect(direct.status).toBe(201);
    await jobs.run('outbox-relay');
    expect((await runsOf(loop.id)).length).toBe(1);
  });

  it('ends the run when the approval is rejected, and ignores paused and draft workflows', async () => {
    const mgr = await w.employee('Rej Manager');
    const emp = await w.employee('Rej Employee', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const active = (await wf({ steps: [{ type: 'approval', approver: { kind: 'manager' }, title: 'Check this' }, { type: 'notify', to: { kind: 'subject_employee' }, title: 'should not run' }] })).body;
    const paused = (await wf({ status: 'paused' })).body;
    const draft = (await wf({ status: 'draft' })).body;
    await claim(s, emp.id, 10);
    await jobs.run('outbox-relay');
    const [{ id: approvalId }] = (await h.api.get('/v1/automation/approvals').set(m.auth)).body.data as { id: string }[] as [{ id: string }];
    await h.api.post(`/v1/automation/approvals/${approvalId}/decide`).set(m.auth).send({ decision: 'rejected', comment: 'No' });
    const [run] = await runsOf(active.id);
    expect(run).toMatchObject({ status: 'rejected', error: 'No' });
    expect(run!.log.some((l) => l.type === 'notify')).toBe(false);
    expect(await runsOf(paused.id)).toHaveLength(0);
    expect(await runsOf(draft.id)).toHaveLength(0);
  });

  it('waits out a delay and carries on when the worker job runs', async () => {
    const mgr = await w.employee('Delay Manager');
    const emp = await w.employee('Delay Employee', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const flow = (await wf({ steps: [{ type: 'delay', minutes: 60 }, { type: 'notify', to: { kind: 'manager' }, title: 'Still pending after an hour' }] })).body;
    await claim(s, emp.id, 20);
    await jobs.run('outbox-relay');
    let [run] = await runsOf(flow.id);
    expect(run).toMatchObject({ status: 'waiting' });
    expect(new Date(run!.resumeAt!).getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
    await jobs.run('run-workflows');
    expect((await runsOf(flow.id))[0]!.status).toBe('waiting'); // not due yet
    await owner.query(`update workflow_runs set resume_at = now() - interval '1 minute' where id = $1`, [run!.id]);
    await jobs.run('run-workflows');
    [run] = await runsOf(flow.id);
    expect(run!.status).toBe('completed');
    expect(((await h.api.get('/v1/notifications').set(m.auth)).body.data as { title: string }[]).some((n) => n.title === 'Still pending after an hour')).toBe(true);
  });

  it('calls a webhook with a signature the company can check, and records a failure without blocking anything else', async () => {
    const got: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
    const server = createServer((req, res) => { const c: Buffer[] = []; req.on('data', (d: Buffer) => c.push(d)); req.on('end', () => { got.push({ headers: req.headers, body: Buffer.concat(c).toString() }); res.statusCode = 200; res.end('ok'); }); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const mgr = await w.employee('Hook Manager');
      const emp = await w.employee('Hook Employee', { reportingManagerId: mgr.id });
      const s = await w.join(emp);
      const good = (await wf({ steps: [{ type: 'webhook', url: `https://127.0.0.1:${port}/hook`, includePayload: true }] })).body;
      // The test server is plain http; the engine is allowed private addresses in tests, so an https URL is only needed to pass validation.
      await owner.query(`update workflows set steps = jsonb_set(steps, '{0,url}', to_jsonb($1::text)) where id = $2`, [`http://127.0.0.1:${port}/hook`, good.id]);
      const bad = (await wf({ steps: [{ type: 'webhook', url: 'https://127.0.0.1:1/never' }, { type: 'notify', to: { kind: 'manager' }, title: 'unreached' }] })).body;
      await claim(s, emp.id, 55);
      await jobs.run('outbox-relay');
      expect(got).toHaveLength(1);
      const secret = (await h.api.get('/v1/automation/webhook-secret').set(w.co.auth)).body.secret as string;
      expect(got[0]!.headers['x-trackrex-signature']).toBe(`sha256=${createHmac('sha256', secret).update(got[0]!.body).digest('hex')}`);
      expect(got[0]!.headers['x-trackrex-event']).toBe('expense.submitted');
      expect(JSON.parse(got[0]!.body)).toMatchObject({ event: 'expense.submitted', payload: { amount: 55 }, employee: { name: 'Hook Employee' } });
      expect((await runsOf(good.id))[0]!.status).toBe('completed');
      const [failed] = await runsOf(bad.id);
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBeTruthy();
      expect(failed!.log.at(-1)!.result).toMatch(/^failed/);
      expect((await h.api.get('/v1/automation/webhook-secret').set(s.auth)).status).toBe(403);
    } finally { server.close(); }
  });
});

describe('webhook safety', () => {
  const body = '{}';
  it.each(['https://127.0.0.1/x', 'https://localhost/x', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://db.internal/x'])('refuses %s', async (url) => {
    await expect(callWebhook(url, body, {}, { allowPrivate: false })).rejects.toThrow(/not allowed/);
  });
  it('refuses plain http and sends no redirects or long calls', async () => {
    await expect(callWebhook('http://example.com/x', body, {}, { allowPrivate: false })).rejects.toThrow(/https/);
    const seen: RequestInit[] = [];
    const fetchFn = (async (_u: URL, init: RequestInit) => { seen.push(init); return new Response('', { status: 302 }); }) as unknown as typeof fetch;
    await expect(callWebhook('http://127.0.0.1/x', body, {}, { allowPrivate: true, fetchFn })).rejects.toThrow(/answered 302/);
    expect(seen[0]).toMatchObject({ redirect: 'manual', method: 'POST' });
    expect(seen[0]!.signal).toBeTruthy();
  });
});
