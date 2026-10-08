import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); await owner.end(); });

const T = '/v1/helpdesk/tickets';
const raise = (auth: Record<string, string>, over: Record<string, unknown> = {}) => h.api.post(T).set(auth).send({ subject: 'Laptop will not start', description: 'Black screen', category: 'it', ...over });

describe('help desk tickets', () => {
  it('lets anyone raise a ticket for themselves, with deadlines from the company\'s settings', async () => {
    const e = await w.join(await w.employee('Hd Raiser'));
    const urgent = await raise(e.auth, { priority: 'urgent' });
    expect(urgent.status, JSON.stringify(urgent.body)).toBe(201);
    expect(urgent.body).toMatchObject({ code: expect.stringMatching(/^HD-/), status: 'open', priority: 'urgent' });
    const hours = (iso: string) => Math.round((new Date(iso).getTime() - new Date(urgent.body.createdAt).getTime()) / 3_600_000);
    expect(hours(urgent.body.firstResponseDueAt)).toBe(1);
    expect(hours(urgent.body.resolutionDueAt)).toBe(4);
    const normal = await raise(e.auth);
    expect(hours.call(null, normal.body.resolutionDueAt) - 0).toBeGreaterThan(0);
    // clients cannot choose workflow fields
    const sneaky = await raise(e.auth, { status: 'resolved', assigneeId: '00000000-0000-4000-8000-000000000000', rating: 5 });
    expect(sneaky.body).toMatchObject({ status: 'open', assigneeId: null, rating: null });
    // nor raise tickets for someone else
    const other = await w.employee('Hd Other');
    expect((await raise(e.auth, { requesterId: other.id })).status).toBe(403);
  });

  it('shows people their own tickets, managers their reportees\', and the help desk everything', async () => {
    const mgr = await w.employee('Hd Mgr');
    const a = await w.employee('Hd A', { reportingManagerId: mgr.id });
    const b = await w.employee('Hd B');
    const m = await w.join(mgr, ['manager']);
    const sa = await w.join(a);
    const sb = await w.join(b);
    await raise(sa.auth, { subject: 'A needs a monitor' });
    await raise(sb.auth, { subject: 'B needs a badge' });
    const subjects = async (auth: Record<string, string>) => ((await h.api.get(`${T}?limit=100`).set(auth)).body.data as { subject: string }[]).map((x) => x.subject);
    expect(await subjects(sa.auth)).toEqual(['A needs a monitor']);
    expect(await subjects(sb.auth)).toEqual(['B needs a badge']);
    expect(await subjects(m.auth)).toEqual(['A needs a monitor']);
    expect(await subjects(w.co.auth)).toEqual(expect.arrayContaining(['A needs a monitor', 'B needs a badge']));
  });

  it('runs a ticket: assign, reply, internal note hidden from the requester, resolve, rate, close', async () => {
    const agentEmp = await w.employee('Hd Agent');
    const agent = await w.join(agentEmp, ['hr_admin']);
    const req = await w.employee('Hd Requester');
    const r = await w.join(req);
    const t = (await raise(r.auth)).body as { id: string };
    // the requester cannot work the ticket
    expect((await h.api.post(`${T}/${t.id}/assign`).set(r.auth).send({ assigneeId: agentEmp.id })).status).toBe(403);
    expect((await h.api.post(`${T}/${t.id}/status`).set(r.auth).send({ status: 'resolved' })).status).toBe(403);

    const asg = await h.api.post(`${T}/${t.id}/assign`).set(agent.auth).send({ assigneeId: agentEmp.id });
    expect(asg.body).toMatchObject({ status: 'in_progress', assigneeId: agentEmp.id });
    await h.api.post(`${T}/${t.id}/comments`).set(agent.auth).send({ body: 'Checking the battery', internal: true });
    const reply = await h.api.post(`${T}/${t.id}/comments`).set(agent.auth).send({ body: 'Can you hold the power button for 10 seconds?' });
    expect(reply.body.data).toHaveLength(2);
    const seen = await h.api.get(`${T}/${t.id}/comments`).set(r.auth);
    expect(seen.body.data).toHaveLength(1);
    expect(seen.body.data[0].body).toMatch(/power button/);
    expect((await h.api.post(`${T}/${t.id}/comments`).set(r.auth).send({ body: 'sneaky note', internal: true })).status).toBe(403);
    expect((await h.api.post(`${T}/${t.id}/comments`).set(r.auth).send({ body: 'Done, still dead.' })).body.data).toHaveLength(2);
    expect((await h.api.get(`${T}/${t.id}`).set(r.auth)).body.firstRespondedAt).toBeTruthy();

    // a stranger cannot comment or see it
    const stranger = await w.join(await w.employee('Hd Stranger'));
    expect((await h.api.post(`${T}/${t.id}/comments`).set(stranger.auth).send({ body: 'hi' })).status).toBe(404);

    // the requester is told; resolving and rating
    await h.app.get(JobsService).run('outbox-relay');
    const notes = ((await h.api.get('/v1/notifications').set(r.auth)).body.data as { title: string }[]).map((n) => n.title);
    expect(notes).toContain('The help desk replied to your ticket');
    expect((await h.api.post(`${T}/${t.id}/rate`).set(r.auth).send({ rating: 4 })).body.code).toBe('not_resolved');
    const res = await h.api.post(`${T}/${t.id}/status`).set(agent.auth).send({ status: 'resolved', message: 'Replaced the battery.' });
    expect(res.body.status).toBe('resolved');
    expect(res.body.resolvedAt).toBeTruthy();
    await h.app.get(JobsService).run('outbox-relay');
    expect(((await h.api.get('/v1/notifications').set(r.auth)).body.data as { title: string }[]).map((n) => n.title)).toContain('Your ticket was resolved');
    expect((await h.api.post(`${T}/${t.id}/rate`).set(stranger.auth).send({ rating: 1 })).status).toBe(404);
    expect((await h.api.post(`${T}/${t.id}/rate`).set(r.auth).send({ rating: 5, comment: 'Quick' })).body.rating).toBe(5);
    expect((await h.api.post(`${T}/${t.id}/rate`).set(r.auth).send({ rating: 9 })).status).toBe(422);
    expect((await h.api.post(`${T}/${t.id}/close`).set(r.auth).send({})).body.status).toBe('closed');
    expect((await h.api.post(`${T}/${t.id}/comments`).set(r.auth).send({ body: 'one more thing' })).body.code).toBe('ticket_closed');
    expect((await h.api.post(`${T}/${t.id}/reopen`).set(r.auth).send({})).body.status).toBe('open');
  });

  it('lets the requester reword an untouched ticket but not one being worked on, and limits reopening in time', async () => {
    const agent = await w.join(await w.employee('Hd Agent2'), ['hr_admin']);
    const r = await w.join(await w.employee('Hd Editor'));
    const t = (await raise(r.auth)).body as { id: string; version: number };
    expect((await h.api.patch(`${T}/${t.id}`).set(r.auth).send({ subject: 'Laptop battery is dead' })).body.subject).toBe('Laptop battery is dead');
    expect((await h.api.patch(`${T}/${t.id}`).set(r.auth).send({ priority: 'urgent' })).status).toBe(403);
    expect((await h.api.patch(`${T}/${t.id}`).set(agent.auth).send({ priority: 'high' })).body.priority).toBe('high');
    await h.api.post(`${T}/${t.id}/status`).set(agent.auth).send({ status: 'in_progress' });
    expect((await h.api.patch(`${T}/${t.id}`).set(r.auth).send({ subject: 'Changed my mind' })).status).toBe(403);
    await h.api.post(`${T}/${t.id}/status`).set(agent.auth).send({ status: 'resolved' });
    await owner.query(`update tickets set resolved_at = now() - interval '20 days' where id = $1`, [t.id]);
    expect((await h.api.post(`${T}/${t.id}/reopen`).set(r.auth).send({})).body.code).toBe('too_late');
    expect((await h.api.post(`${T}/${t.id}/reopen`).set(agent.auth).send({})).body.status).toBe('open');
  });

  it('reports each missed deadline once, tells the right people, and closes resolved tickets left alone', async () => {
    const agentEmp = await w.employee('Hd Sla Agent');
    const agent = await w.join(agentEmp, ['hr_admin']);
    const r = await w.join(await w.employee('Hd Sla Requester'));
    const unassigned = (await raise(r.auth, { subject: 'Nobody has this' })).body as { id: string };
    const mine = (await raise(r.auth, { subject: 'Assigned to the agent' })).body as { id: string };
    await h.api.post(`${T}/${mine.id}/assign`).set(agent.auth).send({ assigneeId: agentEmp.id });
    await owner.query(`update tickets set first_response_due_at = now() - interval '2 hours', resolution_due_at = now() - interval '1 hour' where id = any($1::uuid[])`, [[unassigned.id, mine.id]]);
    const jobs = h.app.get(JobsService);
    await jobs.run('check-ticket-sla');
    await jobs.run('check-ticket-sla'); // a second pass reports nothing new
    await jobs.run('outbox-relay');
    const agentTitles = ((await h.api.get('/v1/notifications').set(agent.auth)).body.data as { title: string; body: string }[]).filter((n) => /missed its/.test(n.title));
    expect(agentTitles.filter((n) => n.body === 'Assigned to the agent')).toHaveLength(2); // first reply (assigned tickets with no public reply) and resolution
    // unassigned tickets go to the administrators
    const adminTitles = ((await h.api.get('/v1/notifications').set(w.co.auth)).body.data as { body: string }[]).filter((n) => n.body === 'Nobody has this');
    expect(adminTitles).toHaveLength(2);
    const sum = await h.api.get(`${T}/summary`).set(w.co.auth);
    expect(sum.status, JSON.stringify(sum.body)).toBe(200);
    expect(sum.body.overdue).toBeGreaterThanOrEqual(2);

    // resolved and untouched for a week: closed automatically
    await h.api.post(`${T}/${mine.id}/status`).set(agent.auth).send({ status: 'resolved' });
    await owner.query(`update tickets set resolved_at = now() - interval '9 days' where id = $1`, [mine.id]);
    await jobs.run('check-ticket-sla');
    expect((await h.api.get(`${T}/${mine.id}`).set(w.co.auth)).body.status).toBe('closed');
  });

  it('raises ticket events that workflows can act on', async () => {
    const wf = await h.api.post('/v1/automation/workflows').set(w.co.auth).send({
      name: 'Urgent ticket alert', status: 'active', trigger: 'ticket.created', conditions: [{ path: 'payload.priority', op: 'eq', value: 'urgent' }],
      steps: [{ type: 'notify', to: { kind: 'role', roleKey: 'admin' }, title: 'Urgent: {{payload.title}}' }],
    });
    expect(wf.status, JSON.stringify(wf.body)).toBe(201);
    const r = await w.join(await w.employee('Hd Wf Requester'));
    await raise(r.auth, { subject: 'Server room is hot', priority: 'urgent' });
    await raise(r.auth, { subject: 'Low priority thing', priority: 'low' });
    await h.app.get(JobsService).run('outbox-relay');
    const runs = (await h.api.get(`/v1/automation/runs?workflowId=${wf.body.id}`).set(w.co.auth)).body.data as { status: string }[];
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('completed');
  });
});

describe('assets', () => {
  it('records equipment, assigns it, takes it back with its condition, and keeps the history', async () => {
    const emp = await w.employee('As Holder');
    const s = await w.join(emp);
    const made = await h.api.post('/v1/helpdesk/assets').set(w.co.auth).send({ name: 'ThinkPad T14', category: 'laptop', serial: 'TP-1001', status: 'assigned', assignedToId: emp.id });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body).toMatchObject({ code: expect.stringMatching(/^AST-/), status: 'in_stock', assignedToId: null }); // clients cannot choose status
    const id = made.body.id as string;
    expect((await h.api.post(`/v1/helpdesk/assets/${id}/assign`).set(w.co.auth).send({ employeeId: emp.id, note: 'Joining kit' })).body).toMatchObject({ status: 'assigned', assignedToId: emp.id });
    expect((await h.api.post(`/v1/helpdesk/assets/${id}/assign`).set(w.co.auth).send({ employeeId: emp.id })).body.code).toBe('not_in_stock');
    expect((await h.api.delete(`/v1/helpdesk/assets/${id}`).set(w.co.auth)).body.code).toBe('asset_assigned');
    // the holder sees it in "my assets"; nobody else does; employees cannot browse the company list
    const mine = await h.api.get('/v1/helpdesk/my-assets').set(s.auth);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ name: 'ThinkPad T14', serial: 'TP-1001' });
    const other = await w.join(await w.employee('As Other'));
    expect((await h.api.get('/v1/helpdesk/my-assets').set(other.auth)).body.data).toHaveLength(0);
    expect((await h.api.get('/v1/helpdesk/assets').set(s.auth)).status).toBe(403);
    expect((await h.api.post(`/v1/helpdesk/assets/${id}/assign`).set(s.auth).send({ employeeId: emp.id })).status).toBe(403);

    expect((await h.api.post(`/v1/helpdesk/assets/${id}/return`).set(w.co.auth).send({ condition: 'needs_repair', note: 'Cracked hinge' })).body).toMatchObject({ status: 'repair', assignedToId: null });
    expect((await h.api.post(`/v1/helpdesk/assets/${id}/repaired`).set(w.co.auth).send({})).body.status).toBe('in_stock');
    await h.api.post(`/v1/helpdesk/assets/${id}/assign`).set(w.co.auth).send({ employeeId: other.auth ? emp.id : emp.id });
    expect((await h.api.post(`/v1/helpdesk/assets/${id}/return`).set(w.co.auth).send({ condition: 'lost' })).body.status).toBe('retired');
    expect((await h.api.patch(`/v1/helpdesk/assets/${id}`).set(w.co.auth).send({ name: 'Renamed' })).body.code).toBe('asset_retired');
    const hist = (await h.api.get(`/v1/helpdesk/assets/${id}/history`).set(w.co.auth)).body.data as { condition: string | null; employeeName: string }[];
    expect(hist.map((x) => x.condition)).toEqual(['lost', 'needs_repair']);
    expect(hist[0]!.employeeName).toBe('As Holder');
    expect((await h.api.get('/v1/helpdesk/my-assets').set(s.auth)).body.data).toHaveLength(0);
  });
});
