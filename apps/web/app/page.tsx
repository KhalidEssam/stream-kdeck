import { PurchasePanel } from './purchase-panel';
import { getEnv } from '@/lib/env';
import { getPlanConfigs, PlanConfig } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const plans = await getPlanConfigs();
  const currency = getEnv('PAYMOB_CURRENCY', 'USD');
  const desktop = plans.find((plan) => plan.id === 'desktop_license') ?? plans[0];
  const aiPro = plans.find((plan) => plan.id === 'ai_pro_monthly') ?? desktop;

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav" aria-label="Primary">
          <div className="brand">Control Surface</div>
          <a className="nav-link" href="/checkout/success">
            Purchase help
          </a>
        </nav>

        <section className="hero">
          <div>
            <p className="eyebrow">Desktop license + AI credits</p>
            <h1 className="headline">Control Surface checkout</h1>
            <p className="summary">
              Buy a desktop license, unlock the mobile deck, and receive an activation
              key by email after Paymob confirms payment.
            </p>

            <div className="metrics" aria-label="Plan summary">
              <div className="metric">
                <strong>{formatPrice(desktop.amountCents, currency)}</strong>
                <span>one-time desktop license</span>
              </div>
              <div className="metric">
                <strong>{desktop.desktopMonthlyAiCredits}</strong>
                <span>included AI calls each month</span>
              </div>
              <div className="metric">
                <strong>{aiPro.monthlyAiCredits}</strong>
                <span>AI Pro monthly credits</span>
              </div>
            </div>
          </div>

          <PurchasePanel plans={toPurchaseOptions(plans, currency)} />
        </section>
      </div>
    </main>
  );
}

function toPurchaseOptions(plans: PlanConfig[], currency: string) {
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.id === 'desktop_license'
      ? 'Desktop License'
      : plan.id === 'ai_pro_monthly'
        ? 'Desktop + AI Pro'
        : 'Desktop + AI Pro Yearly',
    price: formatPrice(plan.amountCents, currency) + (plan.id === 'ai_pro_monthly' ? '/mo' : plan.id === 'ai_pro_yearly' ? '/yr' : ''),
    copy: plan.includesAiPro
      ? `Desktop license plus ${plan.monthlyAiCredits} AI calls per month.`
      : `Full deck access and ${plan.desktopMonthlyAiCredits} AI calls each month.`,
  }));
}

function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
