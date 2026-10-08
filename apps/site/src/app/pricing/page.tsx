import type { Metadata } from 'next';
import { PricingCalculator } from '../../components/pricing-calculator';
import { Section } from '../../components/chrome';

export const metadata: Metadata = { title: 'Pricing', description: 'Per-seat pricing for Office, Field and All in one, in rupees or dollars.' };

export default function Pricing() {
  return (
    <>
      <Section title="Simple per-seat pricing" intro="Pay for the people you have. Every plan starts with a 14-day trial of every module, no card needed.">
        <PricingCalculator />
      </Section>
      <Section title="Questions">
        <dl className="grid gap-4 md:grid-cols-2">
          {[
            ['What is a seat?', 'One active employee record. Exited employees do not count.'],
            ['Can I change plans or seats?', 'Yes, at any time. Changes take effect immediately and are billed from your next monthly invoice.'],
            ['How do I pay?', 'Invoices are issued monthly in advance. Pay by bank transfer, or online where your account offers it.'],
            ['What happens if I do not pay?', 'You get a week’s grace. After that the account is marked past due, and after thirty days it is suspended until the invoice is paid. Your data is kept.'],
          ].map(([q, a]) => <div key={q} className="rounded-card border border-rule bg-surface p-5"><dt className="font-semibold">{q}</dt><dd className="mt-1 text-sm text-muted">{a}</dd></div>)}
        </dl>
      </Section>
    </>
  );
}
