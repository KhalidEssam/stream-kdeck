import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { LogoutButton } from './dashboard-actions';

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/license', label: 'License' },
  { href: '/dashboard/upgrade', label: 'Upgrade' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/account', label: 'Account' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <main className="workspace-page">
      <div className="workspace-shell">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Customer dashboard</p>
            <h1>Control Surface</h1>
            <p>{session.user.email}</p>
          </div>
          <LogoutButton />
        </header>
        <nav className="workspace-tabs" aria-label="Dashboard">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </main>
  );
}
