import { Suspense } from 'react';
import { NavbarWrapper } from './components/navbar-wrapper';
import { Footer } from './components/footer';
import { LandingClient } from './landing-client';
import { NoLicenseBanner } from './components/no-license-banner';
import { getCurrentSession } from '@/lib/auth/session';
import { getEnv } from '@/lib/env';
import { getPlanConfigs, PlanConfig } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [plans, session] = await Promise.all([getPlanConfigs(), getCurrentSession()]);
  const currency = getEnv('PAYMOB_CURRENCY', 'USD');
  const desktop  = plans.find((p) => p.id === 'desktop_license') ?? plans[0];
  const aiPro    = plans.find((p) => p.id === 'ai_pro_monthly')  ?? desktop;

  return (
    <>
      <NavbarWrapper />
      <div className="public-layout-body">
        <Suspense>
          <NoLicenseBanner />
        </Suspense>
        <LandingClient
          plans={toPurchaseOptions(plans, currency)}
          currency={currency}
          desktop={desktop}
          aiPro={aiPro}
          currentUserEmail={session?.user.email ?? null}
        />
        <Footer />
      </div>
    </>
  );
}

function toPurchaseOptions(plans: PlanConfig[], currency: string) {
  const desktopPlan = plans.find((p) => p.id === 'desktop_license');
  return plans.map((plan) => {
    const suffix = plan.id === 'ai_pro_monthly' ? '/mo' : plan.id === 'ai_pro_yearly' ? '/yr' : '';
    const combinedAmountCents = plan.includesAiPro && desktopPlan
      ? desktopPlan.amountCents + plan.amountCents
      : undefined;
    return {
      id:            plan.id as 'desktop_license' | 'ai_pro_monthly' | 'ai_pro_yearly',
      name:          plan.id === 'desktop_license'
                       ? 'Desktop License'
                       : plan.id === 'ai_pro_monthly'
                         ? 'Desktop + AI Pro'
                         : 'Desktop + AI Pro Yearly',
      price:         formatPrice(plan.amountCents, currency) + suffix,
      combinedPrice: combinedAmountCents !== undefined
                       ? formatPrice(combinedAmountCents, currency) + suffix
                       : undefined,
      copy:          plan.includesAiPro
                       ? `Desktop license plus ${plan.monthlyAiCredits} AI calls per month.`
                       : `Full deck access and ${plan.desktopMonthlyAiCredits} AI calls each month.`,
      highlighted:   plan.id === 'ai_pro_monthly',
    };
  });
}

function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style:               'currency',
    currency,
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
