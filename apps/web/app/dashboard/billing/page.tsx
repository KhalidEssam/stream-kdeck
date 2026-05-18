import { requireSession } from '@/lib/auth/session';
import { getCustomerDashboard } from '@/lib/dashboard-data';
import { CancelSubscriptionButton } from '../dashboard-actions';

export default async function BillingPage() {
  const session = await requireSession();
  const dashboard = await getCustomerDashboard(session.user.sub, session.user.email);
  const subscription = dashboard.subscription;
  const canCancel = subscription?.status === 'active' || subscription?.status === 'past_due';

  return (
    <section className="panel workspace-panel">
      <h2>Billing</h2>
      <div className="detail-list">
        <div>
          <span>Status</span>
          <strong>{subscription?.status ?? 'inactive'}</strong>
        </div>
        <div>
          <span>Current period end</span>
          <strong>{formatDate(subscription?.currentPeriodEnd)}</strong>
        </div>
        <div>
          <span>Paymob subscription</span>
          <strong>{subscription?.paymobSubscriptionId ?? 'not available'}</strong>
        </div>
        <div>
          <span>Paymob order</span>
          <strong>{subscription?.paymobOrderId ?? 'not available'}</strong>
        </div>
      </div>
      <CancelSubscriptionButton disabled={!canCancel} />
    </section>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'not set';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}
