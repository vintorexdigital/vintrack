import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

const template = (over: Record<string, unknown> = {}) => h.api.post('/v1/onboarding/templates').set(w.co.auth).send({
  name: `Joining ${Math.random().toString(36).slice(2, 7)}`, kind: 'joining',
  items: [{ title: 'Sign the offer letter', who: 'employee', dueDays: 1 }, { title: 'Set up a desk', who: 'manager', dueDays: 2 }, { title: 'Create email', who: 'it', dueDays: 0 }], ...over,
});

describe('onboarding checklists', () => {
  it('builds templates, starts a case with steps for the right people, and completes when every step is done', async () => {
    const tpl = await template();
    expect(tpl.status, JSON.stringify(tpl.body)).toBe(201);
    expect((await template({ items: [] })).status).toBe(422);
    const mgr = await w.employee('On Manager');
    const emp = await w.employee('On Joiner', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const e = await w.join(emp);

    const started = await h.api.post('/v1/onboarding/cases').set(w.co.auth).send({ employeeId: emp.id, templateId: tpl.body.id, startDate: '2026-11-02' });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const c = started.body as { id: string; items: { id: string; title: string; who: string; assigneeId: string | null; dueDate: string }[] };
    expect(c.items.map((i) => [i.who, i.assigneeId, i.dueDate])).toEqual([['employee', emp.id, '2026-11-03'], ['manager', mgr.id, '2026-11-04'], ['it', null, '2026-11-02']]);
    expect((await h.api.post('/v1/onboarding/cases').set(w.co.auth).send({ employeeId: emp.id, templateId: tpl.body.id })).body.code).toBe('already_open');

    // each person ticks their own step, and not other people's
    const [mine, theirs, it] = c.items;
    expect((await h.api.post(`/v1/onboarding/items/${theirs!.id}/complete`).set(e.auth).send({})).status).toBe(403);
    expect((await h.api.post(`/v1/onboarding/items/${mine!.id}/complete`).set(e.auth).send({ note: 'Signed' })).body).toMatchObject({ done: true, caseCompleted: false });
    expect((await h.api.post(`/v1/onboarding/items/${theirs!.id}/complete`).set(m.auth).send({})).body.done).toBe(true);
    expect((await h.api.post(`/v1/onboarding/items/${it!.id}/complete`).set(m.auth).send({})).status).toBe(403); // an IT step is not the manager's
    const last = await h.api.post(`/v1/onboarding/items/${it!.id}/complete`).set(w.co.auth).send({});
    expect(last.body).toMatchObject({ done: true, caseCompleted: true });
    const done = await h.api.get(`/v1/onboarding/cases/${c.id}`).set(w.co.auth);
    expect(done.body.status).toBe('completed');
    expect((await h.api.post(`/v1/onboarding/items/${it!.id}/reopen`).set(w.co.auth)).body.code).toBe('case_closed');
  });

  it('shows people their own checklist only, and managers their reportees\'', async () => {
    const tpl = (await template()).body;
    const mgr = await w.employee('Scope Mgr');
    const a = await w.employee('Scope A', { reportingManagerId: mgr.id });
    const b = await w.employee('Scope B');
    const m = await w.join(mgr, ['manager']);
    const sa = await w.join(a);
    const sb = await w.join(b);
    await h.api.post('/v1/onboarding/cases').set(w.co.auth).send({ employeeId: a.id, templateId: tpl.id });
    await h.api.post('/v1/onboarding/cases').set(w.co.auth).send({ employeeId: b.id, templateId: tpl.id });
    const names = (r: { body: { data: { employeeName: string }[] } }) => r.body.data.map((x) => x.employeeName);
    expect(names(await h.api.get('/v1/onboarding/cases').set(sa.auth))).toEqual(['Scope A']);
    expect(names(await h.api.get('/v1/onboarding/cases').set(sb.auth))).toEqual(['Scope B']);
    expect(names(await h.api.get('/v1/onboarding/cases').set(m.auth))).toEqual(['Scope A']);
    expect(names(await h.api.get('/v1/onboarding/cases').set(w.co.auth))).toEqual(expect.arrayContaining(['Scope A', 'Scope B']));
    // employees cannot start checklists or read templates
    expect((await h.api.post('/v1/onboarding/cases').set(sa.auth).send({ employeeId: a.id, templateId: tpl.id })).status).toBe(403);
    expect((await h.api.get('/v1/onboarding/templates').set(sa.auth)).status).toBe(403);
  });

  it('starts from a workflow when someone is added, and can be cancelled', async () => {
    const tpl = (await template({ name: 'Auto joining' })).body;
    const wf = await h.api.post('/v1/automation/workflows').set(w.co.auth).send({ name: 'Start joining checklist', status: 'active', trigger: 'employee.created', steps: [{ type: 'start_checklist', templateId: tpl.id }] });
    expect(wf.status, JSON.stringify(wf.body)).toBe(201);
    const newbie = await w.employee('Auto Newbie');
    await h.app.get(JobsService).run('outbox-relay');
    const cases = (await h.api.get(`/v1/onboarding/cases?employeeId=${newbie.id}`).set(w.co.auth)).body.data as { id: string; templateName: string; total: number; done: number; status: string }[];
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ templateName: 'Auto joining', total: 3, done: 0, status: 'open' });
    const runs = (await h.api.get(`/v1/automation/runs?workflowId=${wf.body.id}`).set(w.co.auth)).body.data as { status: string }[];
    expect(runs[0]!.status).toBe('completed');
    expect((await h.api.post(`/v1/onboarding/cases/${cases[0]!.id}/cancel`).set(w.co.auth).send({})).body.ok).toBe(true);
    expect((await h.api.post(`/v1/onboarding/cases/${cases[0]!.id}/cancel`).set(w.co.auth).send({})).status).toBe(409);
  });
});
