import type { Metadata } from 'next';
import { Section } from '../../components/chrome';
import { CONTACT_EMAIL } from '../../content/site';

export const metadata: Metadata = { title: 'Security and privacy', description: 'How Trackrex isolates companies, limits tracking and records every change.' };

const ITEMS = [
  ['Company isolation', 'Every company table has row-level security enforced by the database, with the company identity set per request. The database role the application uses cannot read across companies even if a query is wrong.'],
  ['Authentication', 'Passwords are hashed with scrypt. Sessions use short-lived access tokens and rotating refresh tokens; reuse of a refresh token revokes the whole session family. Platform staff sign in through a separate realm with mandatory two-factor verification.'],
  ['Roles and data scopes', 'Permissions are granted by role and narrowed by data scope. A manager sees reportees; an employee sees themselves.'],
  ['Audit', 'Changes to company data record who, when and the before and after values in an append-only log. Platform staff actions are logged separately.'],
  ['Support access', 'Off by default. When a company allows it, staff start a time-boxed session with a reason. The session cannot read business data, the company sees a banner, and every action is logged.'],
  ['Privacy by design', 'Location is recorded only between punch in and punch out and refused by the server otherwise. Companies set how often it is sent and how long it is kept.'],
  ['Data processing', 'Vintorex acts as a data processor for the personal data of a company’s employees; the company is the controller.'],
];

export default function Security() {
  return (
    <>
      <Section title="Security and privacy" intro="Plain descriptions of what the product actually does today.">
        <dl className="grid gap-4 md:grid-cols-2">{ITEMS.map(([t, b]) => <div key={t} className="rounded-card border border-rule bg-surface p-5"><dt className="font-semibold">{t}</dt><dd className="mt-1 text-sm text-muted">{b}</dd></div>)}</dl>
      </Section>
      <Section title="What we have not finished" intro="We would rather say it than let you find out.">
        <ul className="prose-site text-sm">
          <li>Location data and selfie metadata are protected by database access controls, but are not yet encrypted with per-company keys.</li>
          <li>Single sign-on with SAML for enterprise companies is not available yet.</li>
          <li>A published list of sub-processors and a signed data processing agreement template will be available here before general availability. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to request them now.</li>
          <li>We have not yet had an independent security assessment.</li>
        </ul>
      </Section>
    </>
  );
}
