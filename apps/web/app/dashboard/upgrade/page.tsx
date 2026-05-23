import { requireSession } from '@/lib/auth/session';
import { getPlanConfigs } from '@/lib/plans';
import { getEnv } from '@/lib/env';
import { StartCheckoutButton } from '../dashboard-actions';

export default async function UpgradePage() {
  const session = await requireSession();
  const plans = (await getPlanConfigs()).filter((plan) => plan.includesAiPro);
  const currency = getEnv('PAYMOB_CURRENCY', 'USD');

  return (
    <section className="workspace-grid">
      {plans.map((plan) => (
        <article key={plan.id} className="panel workspace-panel">
          <h2>{plan.subscriptionPeriodMonths === 12 ? 'AI Pro Yearly' : 'AI Pro Monthly'}</h2>
          <p className="price-line">
            {formatPrice(plan.amountCents, currency)}
            <span>{plan.subscriptionPeriodMonths === 12 ? '/yr' : '/mo'}</span>
          </p>
          <p className="fine-print">{plan.monthlyAiCredits} AI credits every month.</p>
          <StartCheckoutButton
            plan={plan.id as 'ai_pro_monthly' | 'ai_pro_yearly'}
            label="Upgrade with Paymob"
          />
        </article>
      ))}
    </section>
  );
}

function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
