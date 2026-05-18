import { listSubscriptions } from '@/lib/admin-data';
import { requireStaff } from '@/lib/auth/session';

export default async function SubscriptionsPage() {
  await requireStaff();
  const subscriptions = await listSubscriptions();

  return (
    <section className="panel workspace-panel">
      <h2>Subscriptions</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Status</th>
            <th>Credits</th>
            <th>Renewal</th>
            <th>Paymob id</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((subscription) => (
            <tr key={subscription.id}>
              <td>{subscription.email ?? subscription.userId}</td>
              <td>{subscription.status}</td>
              <td>{subscription.creditsRemaining}</td>
              <td>{formatDate(subscription.currentPeriodEnd)}</td>
              <td>{subscription.paymobSubscriptionId ?? 'not available'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'not set';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}
