import { requireSession } from '@/lib/auth/session';
import { getCustomerDashboard } from '@/lib/dashboard-data';

export default async function DashboardPage() {
  const session = await requireSession();
  const dashboard = await getCustomerDashboard(session.user.sub, session.user.email);
  const percent =
    dashboard.credits.total > 0
      ? Math.min(100, Math.round((dashboard.credits.used / dashboard.credits.total) * 100))
      : 0;

  return (
    <section className="workspace-grid">
      <article className="panel workspace-panel">
        <h2>License</h2>
        <div className="stat-row">
          <span>Status</span>
          <strong>{dashboard.license?.status ?? 'none'}</strong>
        </div>
        <div className="stat-row">
          <span>Plan</span>
          <strong>{dashboard.license?.planId ?? 'none'}</strong>
        </div>
        <div className="stat-row">
          <span>Device</span>
          <strong>{dashboard.license?.deviceName ?? 'not activated'}</strong>
        </div>
      </article>

      <article className="panel workspace-panel">
        <h2>{dashboard.credits.label}</h2>
        <div className="stat-row">
          <span>Remaining</span>
          <strong>
            {dashboard.credits.remaining} / {dashboard.credits.total}
          </strong>
        </div>
        <div className="meter" aria-label="AI credit usage">
          <span style={{ width: `${percent}%` }} />
        </div>
      </article>

      <article className="panel workspace-panel">
        <h2>AI Pro</h2>
        <div className="stat-row">
          <span>Status</span>
          <strong>{dashboard.subscription?.status ?? 'inactive'}</strong>
        </div>
        <div className="stat-row">
          <span>Renews</span>
          <strong>{formatDate(dashboard.subscription?.currentPeriodEnd)}</strong>
        </div>
      </article>

      <article className="panel workspace-panel wide">
        <h2>Recent AI usage</h2>
        {dashboard.recentUsage.length === 0 ? (
          <p className="fine-print">No AI usage has been logged yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Used</th>
                <th>Provider</th>
                <th>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentUsage.map((usage) => (
                <tr key={usage.id}>
                  <td>{formatDate(usage.usedAt)}</td>
                  <td>{usage.provider ?? 'unknown'}</td>
                  <td>{(usage.tokensIn ?? 0) + (usage.tokensOut ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'not set';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}
