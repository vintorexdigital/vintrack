import { sql } from 'drizzle-orm';
import type { Db } from '../../core/database/db.service.js';
import { providerNames } from '../../shared/providers/messaging/channels.js';
import type { Channel, MessagingProvider, OutboundMessage } from '../../shared/providers/messaging/messaging.provider.js';

export interface Notice {
  userIds: string[];
  type: string;
  title: string;
  body: string | null;
  link: string;
  eventId?: number | undefined;
}

export const SMS_LIMIT = 160;
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** What each channel carries. SMS is one short segment, WhatsApp uses a fixed template name with variables, push has a title and a deep link. */
export function render(channel: Channel, n: { title: string; body: string | null; link: string }, origin: string): Pick<OutboundMessage, 'template' | 'subject' | 'body' | 'vars'> {
  const url = `${origin}${n.link}`;
  switch (channel) {
    case 'email': return { template: 'notification', subject: n.title, body: `${n.title}${n.body ? `\n${n.body}` : ''}\n\nOpen it: ${url}` };
    case 'sms': return { template: 'notification_sms', body: clip(`Trackrex: ${n.title}${n.body ? ` - ${n.body}` : ''}`, SMS_LIMIT) };
    case 'whatsapp': return { template: 'trackrex_notification', body: `*${n.title}*${n.body ? `\n${n.body}` : ''}\n${url}`, vars: { title: n.title, detail: n.body ?? '', url } };
    case 'push': return { template: 'notification_push', subject: n.title, body: clip(n.body ?? n.title, 140), vars: { link: n.link } };
  }
}

interface Target { user_id: string; email: string | null; mobile: string | null; email_on: boolean; sms_on: boolean; whatsapp_on: boolean; push_on: boolean }

/**
 * Sends a notice to each person on the channels they have chosen, and records every attempt in the message log.
 * Email is on by default, push is on by default (and only reaches people with a registered device), SMS and
 * WhatsApp are opt-in. A failed send never blocks the event: the in-app notification is the record.
 */
export async function deliver(db: Db, messaging: MessagingProvider, origin: string, n: Notice): Promise<{ sent: number; failed: number }> {
  if (!n.userIds.length) return { sent: 0, failed: 0 };
  const targets = (await db.q.execute(sql`
    select u.id as user_id, u.email,
           coalesce(u.mobile, (select e.mobile from employees e join platform.memberships m on m.employee_id = e.id where m.user_id = u.id and m.tenant_id = app_tenant_id() limit 1)) as mobile,
           coalesce(p.email, true) as email_on, coalesce(p.sms, false) as sms_on, coalesce(p.whatsapp, false) as whatsapp_on, coalesce(p.push, true) as push_on
      from platform.users u left join notification_prefs p on p.user_id = u.id and p.tenant_id = app_tenant_id()
     where u.id = any(${sql.param(n.userIds)}::uuid[])`)).rows as unknown as Target[];
  const names = providerNames((messaging as { providers?: never }).providers ?? ({ email: messaging, sms: messaging, whatsapp: messaging, push: messaging } as never));
  let sent = 0;
  let failed = 0;
  const attempt = async (userId: string, channel: Channel, to: string) => {
    const r = render(channel, n, origin);
    const base = { channel, to, ...r };
    let providerId: string | null = null;
    let error: string | null = null;
    try { providerId = (await messaging.send(base)).providerId; sent++; } catch (e) { error = (e as Error).message.slice(0, 300); failed++; }
    await db.q.execute(sql`
      insert into message_log (tenant_id, user_id, channel, to_address, template, subject, body, status, provider, provider_id, error, event_id)
      values (app_tenant_id(), ${userId}::uuid, ${channel}, ${to}, ${r.template}, ${r.subject ?? null}, ${r.body}, ${error ? 'failed' : 'sent'}, ${names[channel]}, ${providerId}, ${error}, ${n.eventId ?? null})`);
    return error;
  };
  for (const t of targets) {
    if (t.email && t.email_on) await attempt(t.user_id, 'email', t.email);
    if (t.mobile && t.sms_on) await attempt(t.user_id, 'sms', t.mobile);
    if (t.mobile && t.whatsapp_on) await attempt(t.user_id, 'whatsapp', t.mobile);
    if (t.push_on) {
      const devices = (await db.q.execute(sql`select id, token from push_devices where user_id = ${t.user_id}::uuid and revoked_at is null`)).rows as { id: string; token: string }[];
      for (const d of devices) {
        const err = await attempt(t.user_id, 'push', d.token);
        // A token the push service no longer knows is retired so we stop sending to it.
        if (err?.includes('DeviceNotRegistered')) await db.q.execute(sql`update push_devices set revoked_at = now() where id = ${d.id}::uuid`);
      }
    }
  }
  return { sent, failed };
}
