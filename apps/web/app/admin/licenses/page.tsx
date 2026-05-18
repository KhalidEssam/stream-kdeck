import Link from 'next/link';
import { listLicenses } from '@/lib/admin-data';
import { requireStaff } from '@/lib/auth/session';

export default async function LicensesPage() {
  await requireStaff();
  const licenses = await listLicenses();

  return (
    <section className="panel workspace-panel">
      <h2>Licenses</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Credits</th>
            <th>Device</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {licenses.map((license) => (
            <tr key={license.id}>
              <td>
                <Link href={`/admin/licenses/${license.id}`}>{license.email ?? license.userId}</Link>
              </td>
              <td>{license.status}</td>
              <td>{license.planId}</td>
              <td>
                {license.creditsUsed} / {license.monthlyAiCredits}
              </td>
              <td>{license.deviceName ?? 'not activated'}</td>
              <td>{formatDate(license.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}
