import type { Metadata } from 'next';
import { CtaLink, Section } from '../../components/chrome';
import { CONTACT_EMAIL, signupUrl } from '../../content/site';

export const metadata: Metadata = { title: 'Book a demo', description: 'See Trackrex with your own shifts and policies.' };

export default function Demo() {
  const subject = encodeURIComponent('Trackrex demo request');
  const body = encodeURIComponent('Company:\nNumber of employees:\nField, office or both:\nWhat you would like to see:\n');
  return (
    <Section title="Book a demo" intro="A 30-minute walkthrough using your own shift pattern and leave policy.">
      <div className="flex flex-wrap gap-3">
        <CtaLink href={`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`}>Email us to book</CtaLink>
        <CtaLink href={signupUrl} primary={false}>Or start a free trial</CtaLink>
      </div>
      <p className="mt-4 max-w-xl text-sm text-muted">Booking is by email for now. Tell us how many people you have and whether they work in the field, an office, or both, and we will propose a time.</p>
    </Section>
  );
}
