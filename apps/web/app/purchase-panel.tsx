'use client';

import { FormEvent, useMemo, useState } from 'react';

type PlanId = 'desktop_license' | 'ai_pro_monthly' | 'ai_pro_yearly';

const PLANS: Array<{ id: PlanId; name: string; price: string; copy: string }> = [
  {
    id: 'desktop_license',
    name: 'Desktop License',
    price: '$19',
    copy: 'Full deck access and 50 AI calls each month.',
  },
  {
    id: 'ai_pro_monthly',
    name: 'Desktop + AI Pro',
    price: '$8/mo',
    copy: 'Desktop license plus 500 AI calls per month.',
  },
  {
    id: 'ai_pro_yearly',
    name: 'Desktop + AI Pro Yearly',
    price: '$59/yr',
    copy: 'Best value for power users and demos.',
  },
];

export function PurchasePanel() {
  const [plan, setPlan] = useState<PlanId>('desktop_license');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = useMemo(() => PLANS.find((entry) => entry.id === plan), [plan]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/paymob/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, email }),
      });
      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? 'Unable to start checkout.');
      }
      window.location.assign(payload.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setLoading(false);
    }
  }

  return (
    <form className="panel checkout" onSubmit={handleSubmit}>
      <h2>Start checkout</h2>
      <p>Select a plan and enter the email that should receive the license key.</p>

      <div className="plans" role="radiogroup" aria-label="Plans">
        {PLANS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="plan-button"
            data-active={entry.id === plan}
            onClick={() => setPlan(entry.id)}
            role="radio"
            aria-checked={entry.id === plan}
          >
            <span className="plan-top">
              <span>{entry.name}</span>
              <span>{entry.price}</span>
            </span>
            <span className="plan-copy">{entry.copy}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="email">License email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>

      <button className="primary" type="submit" disabled={loading}>
        {loading ? 'Opening Paymob...' : `Buy ${selectedPlan?.name ?? 'Plan'}`}
      </button>

      {error && <div className="error">{error}</div>}
      <div className="fine-print">
        Paymob is the payment source of truth. License delivery happens only after
        the signed webhook confirms a successful transaction.
      </div>
    </form>
  );
}
