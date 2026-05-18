import Link from 'next/link';
import { listUsers } from '@/lib/admin-data';
import { requireStaff } from '@/lib/auth/session';

export default async function UsersPage() {
  await requireStaff();
  const users = await listUsers();

  return (
    <section className="panel workspace-panel">
      <h2>Users</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Created</th>
            <th>Last sign in</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td><Link href={`/admin/users/${user.id}`}>{user.email ?? user.id}</Link></td>
              <td>{user.role ?? 'customer'}</td>
              <td>{formatDate(user.createdAt)}</td>
              <td>{formatDate(user.lastSignInAt)}</td>
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
