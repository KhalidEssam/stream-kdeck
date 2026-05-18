import { requireSession } from '@/lib/auth/session';
import { getCustomerDashboard } from '@/lib/dashboard-data';
import { ResendKeyButton, RevealLicenseKey } from '../dashboard-actions';

export default async function LicensePage() {
  const session = await requireSession();
  const dashboard = await getCustomerDashboard(session.user.sub, session.user.email);

  return (
    <section className="panel workspace-panel">
      <h2>License key</h2>
      <p className="fine-print">
        Keep this key private. It activates one desktop agent at a time.
      </p>
      <RevealLicenseKey licenseKey={dashboard.licenseKey} />
      <div className="detail-list">
        <div>
          <span>Status</span>
          <strong>{dashboard.license?.status ?? 'none'}</strong>
        </div>
        <div>
          <span>Paymob order</span>
          <strong>{dashboard.license?.paymobOrderId ?? 'not available'}</strong>
        </div>
        <div>
          <span>Activated device</span>
          <strong>{dashboard.license?.deviceName ?? 'not activated'}</strong>
        </div>
      </div>
      <ResendKeyButton />
    </section>
  );
}
