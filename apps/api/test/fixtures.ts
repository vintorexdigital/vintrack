import { zonedToUtcMs } from '@trackrex/rules';
import { PASSWORD, boot, ownerSession, platformAdmin, signIn, uniq, type Harness } from './harness.js';

export const TZ = 'Asia/Kolkata';

/** The nth most recent non-Sunday before today (the seeded weekly off is Sunday). */
export function workday(n: number): string {
  let d = new Date();
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() - 86_400_000);
    if (d.getUTCDay() !== 0) left--;
  }
  return d.toISOString().slice(0, 10);
}
export const lastSunday = (): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() === 0 ? 7 : d.getUTCDay()));
  return d.toISOString().slice(0, 10);
};
/** ISO instant for a local time in the company timezone. */
export const at = (date: string, time: string): string => new Date(zonedToUtcMs(date, time, TZ)).toISOString();

export interface World {
  h: Harness;
  admin: Awaited<ReturnType<typeof platformAdmin>>;
  co: Awaited<ReturnType<typeof ownerSession>>;
  shiftId: string;
  employee(name: string, extra?: Record<string, unknown>): Promise<{ id: string; workEmail: string; code: string }>;
  join(e: { id: string; workEmail: string }, roleKeys?: string[]): Promise<Awaited<ReturnType<typeof signIn>>>;
  punchOffline(auth: Record<string, string>, type: 'in' | 'out', date: string, time: string, extra?: Record<string, unknown>): Promise<import('supertest').Response>;
}

export async function world(h: Harness, opts: { seatLimit?: number } = {}): Promise<World> {
  const admin = await platformAdmin(h);
  const co = await ownerSession(h, admin, { seatLimit: opts.seatLimit ?? 50 });
  const shifts = await h.api.get('/v1/time/shifts').set(co.auth);
  const shiftId = shifts.body.data[0].id as string;
  const employee: World['employee'] = async (name, extra = {}) => {
    const r = await h.api.post('/v1/people/employees').set(co.auth).send({
      firstName: name, displayName: name, dateOfJoining: '2024-01-01', workEmail: `${name.toLowerCase().replace(/\s/g, '.')}.${uniq()}@example.com`, ...extra,
    });
    if (r.status !== 201) throw new Error(`employee failed ${JSON.stringify(r.body)}`);
    if (extra.shiftId !== null) {
      const a = await h.api.post(`/v1/time/shifts/${shiftId}/assignments`).set(co.auth).send({ employeeIds: [r.body.id], effectiveFrom: '2024-01-01' });
      if (a.status !== 200) throw new Error(`assign failed ${JSON.stringify(a.body)}`);
    }
    return { id: r.body.id, workEmail: r.body.workEmail, code: r.body.code };
  };
  const join: World['join'] = async (e, roleKeys = ['employee']) => {
    const inv = await h.api.post(`/v1/people/employees/${e.id}/invite`).set(co.auth).send({ roleKeys });
    if (inv.status !== 201) throw new Error(`invite failed ${JSON.stringify(inv.body)}`);
    const acc = await h.api.post('/v1/auth/invitations/accept').set('x-client', 'api').send({ token: inv.body.devToken, name: 'Person', password: PASSWORD });
    if (acc.body.status !== 'ok') throw new Error(`accept failed ${JSON.stringify(acc.body)}`);
    return signIn(h, e.workEmail, co.slug);
  };
  const punchOffline: World['punchOffline'] = (auth, type, date, time, extra = {}) =>
    h.api.post('/v1/attendance/punches').set(auth).send({ type, at: at(date, time), offline: true, ...extra });
  return { h, admin, co, shiftId, employee, join, punchOffline };
}

export { boot, PASSWORD };
