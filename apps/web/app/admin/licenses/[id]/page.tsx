import { notFound } from 'next/navigation';
import { getLicense } from '@/lib/admin-data';
import { requireStaff } from '@/lib/auth/session';
import { LicenseActions } from '../../admin-actions';

export default async function LicenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const license = await getLicense(id);
  if (!license) notFound();

  return (
    <section className="panel workspace-panel">
      <h2>License detail</h2>
      <div className="detail-list">
        <div><span>Email</span><strong>{license.email ?? license.userId}</strong></div>
        <div><span>Status</span><strong>{license.status}</strong></div>
        <div><span>Plan</span><strong>{license.planId}</strong></div>
        <div><span>Credits</span><strong>{license.creditsUsed} / {license.monthlyAiCredits}</strong></div>
        <div><span>Device</span><strong>{license.deviceName ?? 'not activated'}</strong></div>
        <div><span>Paymob order</span><strong>{license.paymobOrderId ?? 'not available'}</strong></div>
        <div><span>Created</span><strong>{formatDate(license.createdAt)}</strong></div>
      </div>
      <LicenseActions id={license.id} />
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}
