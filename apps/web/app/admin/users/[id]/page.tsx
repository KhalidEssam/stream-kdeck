import { notFound } from 'next/navigation';
import { getUser } from '@/lib/admin-data';
import { requireStaff } from '@/lib/auth/session';

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();

  return (
    <section className="panel workspace-panel">
      <h2>User detail</h2>
      <div className="detail-list">
        <div><span>Email</span><strong>{user.email ?? 'not available'}</strong></div>
        <div><span>Role</span><strong>{user.role ?? 'customer'}</strong></div>
        <div><span>Created</span><strong>{formatDate(user.createdAt)}</strong></div>
        <div><span>Last sign in</span><strong>{formatDate(user.lastSignInAt)}</strong></div>
        <div><span>User id</span><strong>{user.id}</strong></div>
      </div>
      <p className="fine-print">
        Support impersonation returns a magic-link URL through the API only; it does not set staff cookies.
      </p>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'not set';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}
