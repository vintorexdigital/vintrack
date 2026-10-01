import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { simpleParser } from 'mailparser';
import { ConsoleMessaging } from '../src/shared/providers/messaging/messaging.provider.js';
import { SmtpMessaging } from '../src/shared/providers/messaging/smtp.provider.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { boot, type Harness } from './harness.js';
import { world, type World } from './fixtures.js';
let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

function future(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !['01-01', '01-26', '05-01', '08-15', '10-02', '12-25'].includes(iso.slice(5))) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

describe('notification email', () => {
  it('emails the manager about a leave request unless they opted out', async () => {
    const mail = h.app.get(ConsoleMessaging);
    const mgr = await w.employee('Mail Manager');
    const emp = await w.employee('Mail Employee', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const lop = (await h.api.get('/v1/leave/types').set(s.auth)).body.data.find((t: { code: string }) => t.code === 'LOP');
    const apply = (d: string) => h.api.post('/v1/leave/requests').set(s.auth).send({ employeeId: emp.id, leaveTypeId: lop.id, fromDate: d, toDate: d });
    const jobs = h.app.get(JobsService);

    expect((await h.api.get('/v1/notifications/preferences').set(m.auth)).body).toEqual({ email: true });
    const before = mail.sent.length;
    expect((await apply(future(20))).status).toBe(201);
    await jobs.run('outbox-relay');
    const sent = mail.sent.slice(before).filter((x) => x.to === mgr.workEmail);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: 'email', subject: 'Mail Employee applied for leave' });
    expect(sent[0]!.body).toContain('/leave/requests');

    expect((await h.api.put('/v1/notifications/preferences').set(m.auth).send({ email: false })).body).toEqual({ email: false });
    const mid = mail.sent.length;
    expect((await apply(future(30))).status).toBe(201);
    await jobs.run('outbox-relay');
    expect(mail.sent.slice(mid).filter((x) => x.to === mgr.workEmail)).toHaveLength(0);
    // the in-app notification is still there
    expect((await h.api.get('/v1/notifications').set(m.auth)).body.data.filter((n: { type: string }) => n.type === 'leave.requested')).toHaveLength(2);
  });
});

describe('SMTP provider', () => {
  let server: SMTPServer;
  let port = 0;
  const got: string[] = [];
  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true, disabledCommands: ['STARTTLS'],
      onData(stream, _s, cb) { const c: Buffer[] = []; stream.on('data', (d: Buffer) => c.push(d)); stream.on('end', () => { got.push(Buffer.concat(c).toString()); cb(); }); },
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.server.address() as { port: number }).port;
  });
  afterAll(async () => { await new Promise((r) => server.close(() => r(null))); });

  it('delivers an email with the subject, text and escaped HTML, and refuses other channels', async () => {
    const smtp = new SmtpMessaging(`smtp://127.0.0.1:${port}`, 'Trackrex <no-reply@test.example>');
    await smtp.send({ channel: 'email', to: 'person@example.com', template: 'x', subject: 'Hello <b>there</b>', body: 'Line one\nA < B & C' });
    expect(got).toHaveLength(1);
    const parsed = await simpleParser(got[0]!);
    expect(parsed.subject).toBe('Hello <b>there</b>');
    expect(parsed.from?.text).toContain('no-reply@test.example');
    expect(parsed.text).toContain('A < B & C');
    expect(parsed.html).toContain('A &lt; B &amp; C');
    await expect(smtp.send({ channel: 'sms', to: '+911234567890', template: 'x', body: 'hi' })).rejects.toThrow(/not configured/);
  });
});
