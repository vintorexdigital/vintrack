import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';
import { JobsService } from '../src/jobs/jobs.service.js';

let h: Harness;
let w: World;
let jobs: JobsService;
beforeAll(async () => {
  h = await boot();
  w = await world(h);
  jobs = h.app.get(JobsService);
});
afterAll(async () => { await h.close(); });

function future(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !['01-01', '01-26', '05-01', '08-15', '10-02', '12-25'].includes(iso.slice(5))) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

describe('in-app notifications', () => {
  it('tells the manager about a request, the employee about the decision, and nobody twice', async () => {
    const mgr = await w.employee('Notify Manager');
    const emp = await w.employee('Notify Employee', { reportingManagerId: mgr.id });
    const bystander = await w.employee('Notify Bystander');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const b = await w.join(bystander);
    const types = await h.api.get('/v1/leave/types').set(s.auth);
    const lop = types.body.data.find((t: { code: string }) => t.code === 'LOP');
    const d = future(12);
    const made = await h.api.post('/v1/leave/requests').set(s.auth).send({ employeeId: emp.id, leaveTypeId: lop.id, fromDate: d, toDate: d, reason: 'Notification test' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await jobs.run('outbox-relay');
    await jobs.run('outbox-relay');

    const inbox = await h.api.get('/v1/notifications').set(m.auth);
    expect(inbox.status).toBe(200);
    const mine = inbox.body.data.filter((n: { type: string }) => n.type === 'leave.requested');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'Notify Employee applied for leave', readAt: null });
    expect(inbox.body.unread).toBeGreaterThanOrEqual(1);
    // the person who acted is not notified about their own action, and strangers see nothing
    expect((await h.api.get('/v1/notifications').set(s.auth)).body.data.some((n: { type: string }) => n.type === 'leave.requested')).toBe(false);
    expect((await h.api.get('/v1/notifications').set(b.auth)).body.data).toEqual([]);

    expect((await h.api.post(`/v1/leave/requests/${made.body.id}/approve`).set(m.auth).send({})).status).toBe(200);
    await jobs.run('outbox-relay');
    const back = await h.api.get('/v1/notifications?unread=true').set(s.auth);
    expect(back.body.data.map((n: { title: string }) => n.title)).toContain('Your leave was approved');
    const id = back.body.data[0].id as string;
    expect((await h.api.post(`/v1/notifications/${id}/read`).set(s.auth).send({})).status).toBe(200);
    expect((await h.api.get('/v1/notifications?unread=true').set(s.auth)).body.unread).toBe(back.body.unread - 1);
    // another user cannot mark it read
    await h.api.post(`/v1/notifications/${id}/read`).set(b.auth).send({});
    expect((await h.api.get('/v1/notifications').set(s.auth)).body.data.find((n: { id: string }) => n.id === id).readAt).not.toBeNull();
    const all = await h.api.post('/v1/notifications/read-all').set(m.auth).send({});
    expect(all.body.updated).toBeGreaterThanOrEqual(1);
    expect((await h.api.get('/v1/notifications').set(m.auth)).body.unread).toBe(0);
  });

  it('notifies an employee of a new task and the creator when it is done', async () => {
    const emp = await w.employee('Notify Tasker');
    const s = await w.join(emp);
    const t = await h.api.post('/v1/field/tasks').set(w.co.auth).send({ title: 'Notified visit', assigneeId: emp.id });
    await jobs.run('outbox-relay');
    expect((await h.api.get('/v1/notifications').set(s.auth)).body.data.map((n: { title: string }) => n.title)).toContain('New task assigned');
    await h.api.post(`/v1/field/tasks/${t.body.id}/complete`).set(s.auth).send({ outcome: 'Done and dusted' });
    await jobs.run('outbox-relay');
    const owner = await h.api.get('/v1/notifications').set(w.co.auth);
    expect(owner.body.data.some((n: { title: string; body: string }) => n.title === 'Notify Tasker completed a task' && n.body === 'Notified visit')).toBe(true);
  });
});
