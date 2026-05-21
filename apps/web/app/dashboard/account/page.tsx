import { requireSession } from '@/lib/auth/session';
import { DeleteAccountButton, PasswordSetupForm } from '../dashboard-actions';

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ password?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const passwordRequired = params?.password === 'required';

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
        Email changes require a fresh verification and are planned for a later pass.
      </p>
      <div className="danger-zone">
        <h3>{passwordRequired ? 'Create password' : 'Password'}</h3>
        <p>
          {passwordRequired
            ? 'Your account was signed in by email link. Create a password to use the default sign-in method next time.'
            : 'Create or update the password used for email and password sign-in.'}
        </p>
        <PasswordSetupForm required={passwordRequired} />
      </div>
      <div className="danger-zone">
        <h3>Danger zone</h3>
        <p>Deleting this account revokes the license and cancels AI Pro in this system.</p>
        <DeleteAccountButton />
      </div>
    </section>
  );
}
