import Link from 'next/link';
import { requireStaff } from '@/lib/auth/session';
import { LogoutButton } from '../dashboard/dashboard-actions';

const navItems = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/licenses', label: 'Licenses' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();

  return (
    <main className="workspace-page">
      <div className="workspace-shell">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Staff console</p>
            <h1>Admin</h1>
            <p>{session.user.email}</p>
          </div>
          <LogoutButton />
        </header>
        <nav className="workspace-tabs" aria-label="Admin">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          {session.user.role === 'owner' && <Link href="/admin/platform">Platform</Link>}
        </nav>
        {children}
      </div>
    </main>
  );
}
