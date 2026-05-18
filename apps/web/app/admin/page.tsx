import { getAdminStats } from '@/lib/admin-data';
import { requireStaff } from '@/lib/auth/session';

export default async function AdminPage() {
  await requireStaff();
  const stats = await getAdminStats();

  return (
    <section className="workspace-grid">
      <Metric title="Total licenses" value={stats.totalLicenses} />
      <Metric title="Active licenses" value={stats.activeLicenses} />
      <Metric title="Active subscriptions" value={stats.activeSubscriptions} />
      <Metric title="Estimated revenue" value={formatPrice(stats.estimatedRevenueCents)} />
      <article className="panel workspace-panel wide">
        <h2>Recent licenses</h2>
        <AdminTable
          headers={['Email', 'Status', 'Plan', 'Created']}
          rows={stats.recentLicenses.map((row) => [
            row.email ?? row.userId,
            row.status,
            row.planId,
            formatDate(row.createdAt),
          ])}
        />
      </article>
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <article className="panel workspace-panel">
      <h2>{title}</h2>
      <p className="price-line">{value}</p>
    </article>
  );
}

function AdminTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'not set';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function formatPrice(amountCents: number): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(amountCents / 100);
}
