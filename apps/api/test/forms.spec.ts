import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

const QUESTIONS = [
  { id: 'shelf_ok', label: 'Is the shelf stocked?', type: 'yes_no', required: true },
  { id: 'gap', label: 'What is missing?', type: 'textarea', required: true, showIf: { questionId: 'shelf_ok', equals: false } },
  { id: 'facings', label: 'Facings', type: 'number', min: 0, max: 100 },
  { id: 'photo', label: 'Photo of the shelf', type: 'photo' },
];
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const me = async (auth: Record<string, string>) => (await h.api.get('/v1/auth/me').set(auth)).body as { user: { id: string }; company: { id: string } };
const template = (extra: Record<string, unknown> = {}) => h.api.post('/v1/field/forms').set(w.co.auth).send({ name: `Shelf audit ${Math.random().toString(36).slice(2, 7)}`, questions: QUESTIONS, ...extra });

describe('task form templates', () => {
  it('are created by admins, validated, and closed to employees', async () => {
    const ok = await template();
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.questions).toHaveLength(4);
    const bad = await h.api.post('/v1/field/forms').set(w.co.auth).send({ name: 'Broken', questions: [{ id: 'a', label: 'A', type: 'select', options: [{ value: 'x', label: 'X' }] }] });
    expect(bad.status).toBe(422);
    const s = await w.join(await w.employee('Form Reader'));
    expect((await h.api.post('/v1/field/forms').set(s.auth).send({ name: 'Nope', questions: QUESTIONS })).status).toBe(403);
  });
});

describe('forms on tasks', () => {
  async function setup(extra: Record<string, unknown> = {}) {
    const mgr = await w.employee('Form Manager');
    const emp = await w.employee('Form Rep', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const cust = await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'Form Customer' });
    const t = await h.api.post('/v1/field/tasks').set(m.auth).send({ title: 'Audit shelf', customerId: cust.body.id, assigneeId: emp.id, ...extra });
    return { m, s, emp, task: t.body as { id: string } };
  }

  it('attaches a template by hand, freezes its questions, and blocks completion until submitted', async () => {
    const tpl = (await template()).body;
    const { m, s, task } = await setup();
    expect((await h.api.get(`/v1/field/tasks/${task.id}/form`).set(s.auth)).body.form).toBeNull();
    const att = await h.api.post(`/v1/field/tasks/${task.id}/form`).set(m.auth).send({ templateId: tpl.id });
    expect(att.status, JSON.stringify(att.body)).toBe(200);
    expect(att.body.form).toMatchObject({ templateName: tpl.name, status: 'draft', requiredToComplete: true });

    // editing the template afterwards does not change the task's copy
    await h.api.patch(`/v1/field/forms/${tpl.id}`).set(w.co.auth).send({ questions: [{ id: 'only', label: 'Only', type: 'text' }] });
    expect((await h.api.get(`/v1/field/tasks/${task.id}/form`).set(s.auth)).body.form.questions).toHaveLength(4);

    await h.api.post(`/v1/field/tasks/${task.id}/check-in`).set(s.auth).send({});
    const blocked = await h.api.post(`/v1/field/tasks/${task.id}/complete`).set(s.auth).send({ outcome: 'Done' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('form_required');

    // a draft keeps partial answers; submitting checks required and conditional questions
    const draft = await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(s.auth).send({ answers: { shelf_ok: false } });
    expect(draft.body.form).toMatchObject({ status: 'draft', answers: { shelf_ok: false } });
    const incomplete = await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(s.auth).send({ answers: { shelf_ok: false }, submit: true });
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.errors?.[0]?.path ?? incomplete.body.code).toBeTruthy();
    const done = await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(s.auth).send({ answers: { shelf_ok: false, gap: 'No biscuits', facings: 4 }, submit: true });
    expect(done.status).toBe(200);
    expect(done.body.form).toMatchObject({ status: 'submitted', answers: { shelf_ok: false, gap: 'No biscuits', facings: 4 } });
    expect((await h.api.post(`/v1/field/tasks/${task.id}/complete`).set(s.auth).send({ outcome: 'Done' })).status).toBe(200);
    // closed tasks do not take answers; the manager can read them
    expect((await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(s.auth).send({ answers: { shelf_ok: true } })).status).toBe(409);
    expect((await h.api.get(`/v1/field/tasks/${task.id}/form`).set(m.auth)).body.form.answers.gap).toBe('No biscuits');
  });

  it('attaches by task type when a task is created, and lets a template say the form is optional', async () => {
    await template({ name: 'Delivery proof', taskTypes: ['delivery'], requiredToComplete: false, questions: [{ id: 'received_by', label: 'Received by', type: 'text', required: true }] });
    const { s, task } = await setup({ taskType: 'delivery' });
    const form = (await h.api.get(`/v1/field/tasks/${task.id}/form`).set(s.auth)).body.form;
    expect(form).toMatchObject({ templateName: 'Delivery proof', requiredToComplete: false });
    await h.api.post(`/v1/field/tasks/${task.id}/check-in`).set(s.auth).send({});
    expect((await h.api.post(`/v1/field/tasks/${task.id}/complete`).set(s.auth).send({ outcome: 'Left at gate' })).status).toBe(200);
  });

  it('keeps forms inside scope: another employee cannot answer or read them', async () => {
    const tpl = (await template()).body;
    const { m, task } = await setup();
    await h.api.post(`/v1/field/tasks/${task.id}/form`).set(m.auth).send({ templateId: tpl.id });
    const other = await w.join(await w.employee('Form Other'));
    expect((await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(other.auth).send({ answers: { shelf_ok: true } })).status).toBe(404);
    expect((await h.api.post(`/v1/field/tasks/${task.id}/form`).set(other.auth).send({ templateId: tpl.id })).status).toBe(403);
  });

  it('stores photo answers sealed in the file store and shows them only to the person and their manager', async () => {
    const tpl = (await template()).body;
    const { m, s, task } = await setup();
    await h.api.post(`/v1/field/tasks/${task.id}/form`).set(m.auth).send({ templateId: tpl.id });
    const ids = await me(s.auth);
    const key = `forms/${ids.company.id}/${ids.user.id}/${crypto.randomUUID()}.jpg`;
    const up = await h.api.put(`/v1/files/${key}`).set({ ...s.auth, 'Idempotency-Key': crypto.randomUUID(), 'content-type': 'image/jpeg' }).send(JPEG);
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.key).toBe(key);
    // somebody else's key is refused as an answer
    const notMine = `forms/${ids.company.id}/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;
    expect((await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(s.auth).send({ answers: { shelf_ok: true, photo: notMine }, submit: true })).status).toBe(422);
    expect((await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(s.auth).send({ answers: { shelf_ok: true, photo: key }, submit: true })).status).toBe(200);
    const read = (auth: Record<string, string>) => h.api.get(`/v1/files/${key}`).set(auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect((await read(s.auth)).status).toBe(200);
    const asManager = await read(m.auth);
    expect(asManager.status).toBe(200);
    expect(Buffer.compare(asManager.body as Buffer, JPEG)).toBe(0);
    const stranger = await w.join(await w.employee('Form Stranger'));
    expect((await read(stranger.auth)).status).toBe(404);
    // uploads must be JPEG and into your own folder
    expect((await h.api.put(`/v1/files/forms/${ids.company.id}/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`).set({ ...s.auth, 'Idempotency-Key': crypto.randomUUID(), 'content-type': 'image/jpeg' }).send(JPEG)).status).toBe(403);
  });

  it('detaches an unanswered form but not an answered one', async () => {
    const tpl = (await template()).body;
    const { m, s, task } = await setup();
    await h.api.post(`/v1/field/tasks/${task.id}/form`).set(m.auth).send({ templateId: tpl.id });
    expect((await h.api.delete(`/v1/field/tasks/${task.id}/form`).set(m.auth)).status).toBe(200);
    await h.api.post(`/v1/field/tasks/${task.id}/form`).set(m.auth).send({ templateId: tpl.id });
    await h.api.post(`/v1/field/tasks/${task.id}/form/answers`).set(s.auth).send({ answers: { shelf_ok: true } });
    expect((await h.api.delete(`/v1/field/tasks/${task.id}/form`).set(m.auth)).body.code).toBe('form_has_answers');
  });
});
