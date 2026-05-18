import { requireSession } from '@/lib/auth/session';
import { DeleteAccountButton } from '../dashboard-actions';

export default async function AccountPage() {
  const session = await requireSession();

  return (
    <section className="panel workspace-panel">
      <h2>Account</h2>
      <div className="detail-list">
        <div>
          <span>Email</span>
          <strong>{session.user.email ?? 'not available'}</strong>
        </div>
      </div>
      <p className="fine-print">
        Email changes require a fresh magic-link verification and are planned for a later pass.
      </p>
      <div className="danger-zone">
        <h3>Danger zone</h3>
        <p>Deleting this account revokes the license and cancels AI Pro in this system.</p>
        <DeleteAccountButton />
      </div>
    </section>
  );
}
