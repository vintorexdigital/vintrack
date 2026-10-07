import { RequiresModule } from '../../core/auth/decorators.js';
import { Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Module, Param, Post, Query, Req, Res, type RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { e164, idParam, uuid } from '@trackrex/schemas';
import { AuditService } from '../../core/audit.service.js';
import { Public } from '../../core/auth/decorators.js';
import { CONFIG, type Config } from '../../core/config.js';
import { EnvelopeService, isSealedBytes } from '../../core/crypto/envelope.service.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { AppError, badRequest, conflict, forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { FilesModule } from '../files/files.module.js';
import { STORAGE, type StorageProvider } from '../files/storage.js';
import { ExotelTelephony, MockTelephony, TELEPHONY, type CallEvent, type TelephonyProvider } from '../../shared/providers/telephony/telephony.provider.js';

const dialBody = z.object({ customerId: uuid.optional(), leadId: uuid.optional(), phone: e164.optional() }).refine((b) => b.customerId || b.leadId || b.phone, { message: 'Choose who to call.' });
const listQuery = z.object({ customerId: uuid.optional(), leadId: uuid.optional(), employeeId: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });
const progressBody = z.object({ event: z.enum(['agent_answered', 'customer_answered', 'no_answer', 'busy', 'ended']), durationSeconds: z.number().int().min(0).max(14_400).default(0), recording: z.boolean().default(false) });
const LIVE = ['queued', 'ringing_agent', 'ringing_customer', 'in_progress'];

const COLS = sql`s.id, s.employee_id as "employeeId", e.display_name as "employeeName", s.customer_id as "customerId", s.lead_id as "leadId", s.customer_number as "customerNumber", s.status, s.provider,
  s.started_at as "startedAt", s.answered_at as "answeredAt", s.ended_at as "endedAt", s.duration_seconds as "durationSeconds", (s.recording_key is not null) as "hasRecording",
  s.recording_seconds as "recordingSeconds", s.recording_removed as "recordingRemoved", s.error`;

export const recordingKey = (tenantId: string, sessionId: string) => `recordings/${tenantId}/${sessionId}.wav`;

/**
 * Cloud calling: the employee asks to call a customer, the provider rings the employee first and bridges the
 * customer, status comes back on callbacks, and the finished call lands in the call log with its recording.
 * Recordings are off unless the company turns them on, are sealed in storage, are kept for a set time, and every
 * listen is written to the audit log. See ADR 0017.
 */
@Injectable()
export class CallingService {
  constructor(
    private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly settings: SettingsService, private readonly audit: AuditService,
    @Inject(TELEPHONY) private readonly telephony: TelephonyProvider, @Inject(STORAGE) private readonly storage: StorageProvider, private readonly envelope: EnvelopeService,
  ) {}

  async status() {
    const enabled = (await this.settings.get<string>('calls.provider', 'none')) === 'trackrex';
    return {
      enabled, provider: this.telephony.name, mock: this.telephony.name.startsWith('mock'),
      recordCalls: await this.settings.get<boolean>('calls.record_calls', false), announceRecording: await this.settings.get<boolean>('calls.announce_recording', true),
      retentionDays: await this.settings.get<number>('calls.recording_retention_days', 90),
    };
  }

  private async target(b: z.infer<typeof dialBody>): Promise<{ number: string; customerId: string | null; leadId: string | null }> {
    if (b.customerId) {
      const r = (await this.db.q.execute(sql`
        select coalesce(c.phone, (select ct.phone from contacts ct where ct.customer_id = c.id and ct.deleted_at is null and ct.phone is not null order by ct.is_primary desc nulls last limit 1)) as phone
          from customers c where c.id = ${b.customerId}::uuid and c.deleted_at is null`)).rows[0] as { phone: string | null } | undefined;
      if (!r) throw notFound('Customer');
      if (!r.phone) throw unprocessable('This customer has no phone number.', undefined, 'no_number');
      return { number: r.phone, customerId: b.customerId, leadId: null };
    }
    if (b.leadId) {
      const pred = this.scope.predicate(this.authz.require('sales.lead.read'), sql`l.owner_id`);
      const r = (await this.db.q.execute(sql`select l.phone from leads l where l.id = ${b.leadId}::uuid and l.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`)).rows[0] as { phone: string | null } | undefined;
      if (!r) throw notFound('Lead');
      if (!r.phone) throw unprocessable('This lead has no phone number.', undefined, 'no_number');
      return { number: r.phone, customerId: null, leadId: b.leadId };
    }
    return { number: b.phone!, customerId: null, leadId: null };
  }

  async dial(raw: unknown) {
    this.authz.require('calls.call.create');
    const b = dialBody.parse(raw ?? {});
    const st = await this.status();
    if (!st.enabled) throw conflict('calling_off', 'Cloud calling is not turned on for this company.');
    const auth = currentAuth();
    if (!auth.employeeId) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    const me = (await this.db.q.execute(sql`select mobile from employees where id = ${auth.employeeId}::uuid`)).rows[0] as { mobile: string | null };
    if (!me.mobile) throw unprocessable('Add your mobile number to your employee record first: we ring your phone, then connect the customer.', undefined, 'no_mobile');
    const t = await this.target(b);
    const live = await this.db.q.execute(sql`select 1 from call_sessions where employee_id = ${auth.employeeId}::uuid and status = any(${sql.param(LIVE)}::text[]) and started_at > now() - interval '3 hours'`);
    if (live.rows.length) throw conflict('call_in_progress', 'You already have a call in progress.');
    const ins = (await this.db.q.execute(sql`
      insert into call_sessions (tenant_id, employee_id, customer_id, lead_id, agent_number, customer_number, provider, recording_requested, created_by)
      values (app_tenant_id(), ${auth.employeeId}::uuid, ${t.customerId}::uuid, ${t.leadId}::uuid, ${me.mobile}, ${t.number}, ${this.telephony.name}, ${st.recordCalls}, ${auth.userId}::uuid) returning id`)).rows[0] as { id: string };
    try {
      const { providerCallId } = await this.telephony.dial({ sessionId: ins.id, tenantId: currentStore().tenantId!, agentNumber: me.mobile, customerNumber: t.number, record: st.recordCalls });
      await this.db.q.execute(sql`update call_sessions set provider_call_id = ${providerCallId}, status = 'ringing_agent' where id = ${ins.id}::uuid`);
    } catch (e) {
      await this.db.q.execute(sql`update call_sessions set status = 'failed', error = ${(e as Error).message.slice(0, 300)}, ended_at = now() where id = ${ins.id}::uuid`);
      throw new AppError(502, 'telephony_unavailable', 'The calling service could not place the call. Try again in a moment.');
    }
    return this.one(ins.id);
  }

  private async one(id: string) {
    const pred = this.scope.predicate(this.authz.require('calls.session.read'), sql`s.employee_id`);
    const r = (await this.db.q.execute(sql`select ${COLS} from call_sessions s join employees e on e.id = s.employee_id where s.id = ${id}::uuid ${pred ? sql`and ${pred}` : sql``}`)).rows[0];
    if (!r) throw notFound('Call');
    return r as { id: string; status: string };
  }

  get(id: string) { return this.one(id); }

  async list(raw: unknown) {
    const q = listQuery.parse(raw);
    const pred = this.scope.predicate(this.authz.require('calls.session.read'), sql`s.employee_id`);
    const r = await this.db.q.execute(sql`
      select ${COLS} from call_sessions s join employees e on e.id = s.employee_id
       where true ${pred ? sql`and ${pred}` : sql``} ${q.customerId ? sql`and s.customer_id = ${q.customerId}::uuid` : sql``} ${q.leadId ? sql`and s.lead_id = ${q.leadId}::uuid` : sql``} ${q.employeeId ? sql`and s.employee_id = ${q.employeeId}::uuid` : sql``}
       order by s.started_at desc limit ${q.limit}`);
    return { data: r.rows };
  }

  async hangup(id: string) {
    this.authz.require('calls.call.create');
    const s = await this.one(id);
    const row = (await this.db.q.execute(sql`select employee_id, provider_call_id, status from call_sessions where id = ${id}::uuid`)).rows[0] as { employee_id: string; provider_call_id: string | null; status: string };
    if (row.employee_id !== currentAuth().employeeId) throw forbidden('Only the person on the call can end it.', 'not_your_call');
    if (!LIVE.includes(row.status)) return s;
    if (row.provider_call_id) await this.telephony.hangup(row.provider_call_id).catch(() => undefined);
    const answered = row.status === 'in_progress';
    await this.finish(id, answered ? 'completed' : 'no_answer', 0, undefined);
    return this.one(id);
  }

  /** What the provider reports (or, in mock mode, what the simulate buttons report). Safe to receive twice. */
  async applyEvent(providerCallId: string, ev: CallEvent): Promise<void> {
    const s = (await this.db.q.execute(sql`select id, status from call_sessions where provider_call_id = ${providerCallId} for update`)).rows[0] as { id: string; status: string } | undefined;
    if (!s || !LIVE.includes(s.status)) return;
    if (ev.type === 'agent_answered') { await this.db.q.execute(sql`update call_sessions set status = 'ringing_customer' where id = ${s.id}::uuid and status = 'ringing_agent'`); return; }
    if (ev.type === 'customer_answered') { await this.db.q.execute(sql`update call_sessions set status = 'in_progress', answered_at = now() where id = ${s.id}::uuid and status in ('ringing_customer', 'ringing_agent')`); return; }
    await this.finish(s.id, ev.outcome, ev.durationSeconds, ev.recordingRef);
  }

  private async finish(id: string, outcome: 'completed' | 'no_answer' | 'busy' | 'failed', durationSeconds: number, recordingRef: string | undefined): Promise<void> {
    const s = (await this.db.q.execute(sql`select employee_id, customer_id, lead_id, customer_number, started_at, answered_at from call_sessions where id = ${id}::uuid`)).rows[0] as { employee_id: string; customer_id: string | null; lead_id: string | null; customer_number: string; started_at: string; answered_at: string | null };
    let key: string | null = null;
    let seconds: number | null = null;
    if (recordingRef && outcome === 'completed') {
      const audio = await this.telephony.fetchRecording(recordingRef).catch(() => null);
      if (audio) {
        key = recordingKey(currentStore().tenantId!, id);
        await this.storage.put(key, this.envelope.enabled ? await this.envelope.seal(`call.recording:${key}`, audio) : audio);
        seconds = durationSeconds || null;
      }
    }
    const duration = outcome === 'completed' ? durationSeconds : 0;
    const log = (await this.db.q.execute(sql`
      insert into call_logs (tenant_id, employee_id, direction, phone, started_at, duration_seconds, outcome, customer_id, lead_id, notes)
      values (app_tenant_id(), ${s.employee_id}::uuid, 'outgoing', ${s.customer_number}, ${s.answered_at ?? s.started_at}::timestamptz, ${duration},
              ${outcome === 'completed' ? 'connected' : outcome === 'busy' ? 'busy' : 'no_answer'}, ${s.customer_id}::uuid, ${s.lead_id}::uuid, ${'Placed through Trackrex calling.'}) returning id`)).rows[0] as { id: string };
    await this.db.q.execute(sql`
      update call_sessions set status = ${outcome}, ended_at = now(), duration_seconds = ${duration}, recording_key = ${key}, recording_seconds = ${seconds}, call_log_id = ${log.id}::uuid where id = ${id}::uuid`);
  }

  /** Mock mode only: stands in for the provider's callbacks. */
  async mockProgress(id: string, raw: unknown) {
    this.authz.require('calls.call.create');
    if (!this.telephony.name.startsWith('mock')) throw conflict('not_mock', 'Calls are placed through a real provider; they cannot be simulated.');
    const b = progressBody.parse(raw ?? {});
    const row = (await this.db.q.execute(sql`select employee_id, provider_call_id, recording_requested from call_sessions where id = ${id}::uuid`)).rows[0] as { employee_id: string; provider_call_id: string | null; recording_requested: boolean } | undefined;
    if (!row || row.employee_id !== currentAuth().employeeId) throw notFound('Call');
    if (!row.provider_call_id) throw conflict('not_started', 'That call has not started.');
    const ev: CallEvent = b.event === 'agent_answered' || b.event === 'customer_answered' ? { type: b.event }
      : b.event === 'ended' ? { type: 'ended', outcome: 'completed', durationSeconds: b.durationSeconds, ...(b.recording && row.recording_requested ? { recordingRef: `mock:${Math.min(30, Math.max(3, Math.round(b.durationSeconds / 10)))}` } : {}) }
      : { type: 'ended', outcome: b.event, durationSeconds: 0 };
    await this.applyEvent(row.provider_call_id, ev);
    return this.one(id);
  }

  /** Listening is logged: who, when, which call. */
  async recording(id: string): Promise<Buffer> {
    const pred = this.scope.predicate(this.authz.require('calls.recording.read'), sql`s.employee_id`);
    const r = (await this.db.q.execute(sql`select s.recording_key from call_sessions s where s.id = ${id}::uuid ${pred ? sql`and ${pred}` : sql``}`)).rows[0] as { recording_key: string | null } | undefined;
    if (!r?.recording_key) throw notFound('Recording');
    const stored = await this.storage.get(r.recording_key);
    if (!stored) throw notFound('Recording');
    await this.audit.record({ entity: 'call-sessions', entityId: id, action: 'recording_played', changes: {} });
    return isSealedBytes(stored) ? this.envelope.open(`call.recording:${r.recording_key}`, stored) : stored;
  }

  /** Removes recordings older than the company's retention window. Run by the worker. */
  async purgeRecordings(): Promise<number> {
    const days = await this.settings.get<number>('calls.recording_retention_days', 90);
    const old = (await this.db.q.execute(sql`select id, recording_key from call_sessions where recording_key is not null and ended_at < now() - make_interval(days => ${days}) limit 500`)).rows as { id: string; recording_key: string }[];
    for (const o of old) {
      await this.storage.delete(o.recording_key);
      await this.db.q.execute(sql`update call_sessions set recording_key = null, recording_removed = true where id = ${o.id}::uuid`);
    }
    return old.length;
  }
}

@RequiresModule('cloud_calling')
@Controller('calls')
class CallingController {
  constructor(private readonly svc: CallingService) {}
  @Get('status') status() { return this.svc.status(); }
  @Post('dial') @HttpCode(200) dial(@Body() b: unknown) { return this.svc.dial(b); }
  @Get('sessions') list(@Query() q: unknown) { return this.svc.list(q); }
  @Get('sessions/:id') get(@Param() p: unknown) { return this.svc.get(idParam.parse(p).id); }
  @Post('sessions/:id/hangup') @HttpCode(200) hangup(@Param() p: unknown) { return this.svc.hangup(idParam.parse(p).id); }
  @Post('sessions/:id/mock-progress') @HttpCode(200) progress(@Param() p: unknown, @Body() b: unknown) { return this.svc.mockProgress(idParam.parse(p).id, b); }
  @Get('sessions/:id/recording')
  async recording(@Param() p: unknown, @Res() res: Response) {
    const audio = await this.svc.recording(idParam.parse(p).id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('audio/wav').send(audio);
  }
}

/** Status callbacks from the provider. The company is named in the address; the shared token proves it is the provider. */
@Controller('webhooks/telephony')
class TelephonyWebhookController {
  constructor(private readonly db: Db, private readonly svc: CallingService, @Inject(TELEPHONY) private readonly telephony: TelephonyProvider) {}
  @Public() @Post(':provider') @HttpCode(200)
  async hook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string>, @Query() query: Record<string, string>) {
    const tenant = z.string().uuid().safeParse(query.t);
    const parsed = req.rawBody && tenant.success && provider === this.telephony.name ? this.telephony.parseWebhook(headers, req.rawBody, query) : null;
    if (!parsed || !tenant.success) throw badRequest('invalid_webhook', 'The callback is not valid.');
    await this.db.runAsTenant(tenant.data, {}, () => this.svc.applyEvent(parsed.providerCallId, parsed.event));
    return { received: true };
  }
}

@Module({
  imports: [FilesModule],
  controllers: [CallingController, TelephonyWebhookController],
  providers: [
    CallingService,
    {
      provide: TELEPHONY, inject: [CONFIG],
      useFactory: (cfg: Config): TelephonyProvider => cfg.TELEPHONY_PROVIDER === 'exotel'
        ? new ExotelTelephony({ sid: cfg.EXOTEL_SID!, apiKey: cfg.EXOTEL_API_KEY!, apiToken: cfg.EXOTEL_API_TOKEN!, subdomain: cfg.EXOTEL_SUBDOMAIN, callerId: cfg.EXOTEL_CALLER_ID!, callbackBase: cfg.PUBLIC_API_URL, callbackToken: cfg.TELEPHONY_WEBHOOK_TOKEN! })
        : new MockTelephony(),
    },
  ],
  exports: [CallingService, TELEPHONY],
})
export class CallingModule {}
