import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="status-page">
      <section className="status-card">
        <p className="eyebrow">403</p>
        <h1>Access denied</h1>
        <p>Your account does not have permission to open this area.</p>
        <Link className="nav-link" href="/">
          Back to checkout
        </Link>
      </section>
    </main>
  );
}
