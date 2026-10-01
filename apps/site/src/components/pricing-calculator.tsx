'use client';
import { taxRateBpsFor } from '@trackrex/rules';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { API_URL, signupUrl } from '../content/site';
import { FALLBACK_PLANS, type PublicPlan } from '../content/pricing';

const fmt = (minor: number, cur: string) => new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(minor / 100);
/** Twelve months for the price of ten. */
const ANNUAL_MONTHS = 10;

export function PricingCalculator() {
  const [plans, setPlans] = useState<PublicPlan[]>(FALLBACK_PLANS);
  const [live, setLive] = useState(false);
  const [plan, setPlan] = useState('field');
  const [seats, setSeats] = useState(25);
  const [cur, setCur] = useState<'INR' | 'USD'>('INR');
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${API_URL}/v1/public/plans`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad')))).then((p: PublicPlan[]) => { if (p.length) { setPlans(p); setLive(true); } }).catch(() => undefined);
    return () => ctl.abort();
  }, []);

  const chosen = plans.find((p) => p.key === plan) ?? plans[0]!;
  const calc = useMemo(() => {
    const unit = chosen.prices[cur] ?? 0;
    const months = annual ? ANNUAL_MONTHS : 1;
    const subtotal = unit * seats * months;
    const rate = cur === 'INR' ? taxRateBpsFor('IN') : 0;
    const tax = Math.round((subtotal * rate) / 10_000);
    return { unit, subtotal, tax, total: subtotal + tax, rate, perSeatMonth: annual ? Math.round((unit * ANNUAL_MONTHS) / 12) : unit };
  }, [chosen, cur, seats, annual]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <label key={p.key} className={`flex cursor-pointer flex-col rounded-card border bg-surface p-5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${plan === p.key ? 'border-brand ring-2 ring-brand/30' : 'border-rule'}`}>
            <input type="radio" name="plan" value={p.key} checked={plan === p.key} onChange={() => setPlan(p.key)} className="sr-only" />
            <span className="text-lg font-semibold">{p.name}</span>
            <span className="text-sm text-muted">{p.tagline}</span>
            <span className="mt-3 text-2xl font-semibold tabular-nums">{fmt(annual ? Math.round(((p.prices[cur] ?? 0) * ANNUAL_MONTHS) / 12) : (p.prices[cur] ?? 0), cur)}<span className="text-sm font-normal text-muted"> / seat / month</span></span>
            <ul className="mt-3 space-y-1 text-sm">{p.highlights.map((h) => <li key={h} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-present" aria-hidden />{h}</li>)}</ul>
          </label>
        ))}
      </div>

      <aside className="h-fit rounded-card border border-rule bg-surface p-5" aria-label="Price calculator">
        <h2 className="text-lg font-semibold">Estimate your price</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="seats" className="mb-1 block text-sm font-medium">People</label>
            <input id="seats" type="number" inputMode="numeric" min={1} max={5000} value={seats} onChange={(e) => setSeats(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} className="min-h-11 w-full rounded-input border border-rule bg-surface px-3 tabular-nums" />
          </div>
          <div className="flex flex-wrap gap-4">
            <fieldset><legend className="mb-1 text-sm font-medium">Billing</legend>
              <div className="inline-flex rounded-button border border-rule p-0.5">{[false, true].map((a) => <button key={String(a)} type="button" aria-pressed={annual === a} onClick={() => setAnnual(a)} className={`min-h-9 rounded-input px-3 text-sm font-semibold ${annual === a ? 'bg-brand text-on-brand' : 'text-muted'}`}>{a ? 'Yearly' : 'Monthly'}</button>)}</div>
            </fieldset>
            <fieldset><legend className="mb-1 text-sm font-medium">Currency</legend>
              <div className="inline-flex rounded-button border border-rule p-0.5">{(['INR', 'USD'] as const).map((c) => <button key={c} type="button" aria-pressed={cur === c} onClick={() => setCur(c)} className={`min-h-9 rounded-input px-3 text-sm font-semibold ${cur === c ? 'bg-brand text-on-brand' : 'text-muted'}`}>{c}</button>)}</div>
            </fieldset>
          </div>
          <dl className="space-y-1 border-t border-rule pt-3 text-sm tabular-nums" aria-live="polite">
            <div className="flex justify-between"><dt>{chosen.name}, {seats} {seats === 1 ? 'seat' : 'seats'}</dt><dd>{fmt(calc.subtotal, cur)}</dd></div>
            {calc.rate > 0 && <div className="flex justify-between text-muted"><dt>GST ({calc.rate / 100}%)</dt><dd>{fmt(calc.tax, cur)}</dd></div>}
            <div className="flex justify-between border-t border-rule pt-2 text-base font-semibold"><dt>{annual ? 'Per year' : 'Per month'}</dt><dd>{fmt(calc.total, cur)}</dd></div>
          </dl>
          {annual && <p className="text-xs text-muted">Yearly billing is twelve months for the price of ten.</p>}
          <a href={signupUrl} className="inline-flex min-h-11 w-full items-center justify-center rounded-button bg-brand px-4 text-sm font-semibold text-on-brand no-underline">Start free trial</a>
          <p className="text-xs text-muted">{live ? 'Prices are current.' : 'Showing standard list prices.'} Taxes other than Indian GST are not included. Seats are the people you have in the system.</p>
        </div>
      </aside>
    </div>
  );
}
