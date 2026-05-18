import Link from 'next/link';

const FOOTER_LINKS = [
  {
    heading: 'Product',
    links: [
      { href: '/#features', label: 'Features' },
      { href: '/#pricing',  label: 'Pricing' },
      { href: '/setup',     label: 'Download' },
      { href: '/setup#install', label: 'Setup guide' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/dashboard',         label: 'Customer portal' },
      { href: '/checkout/success',  label: 'Resend license key' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/terms',   label: 'Terms of service' },
      { href: '/privacy', label: 'Privacy policy' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-shell">
        <div className="footer-top">
          {/* Brand column */}
          <div className="footer-brand-col">
            <Link href="/" className="footer-brand" aria-label="KDeck home">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect width="28" height="28" rx="7" fill="var(--accent)" />
                <rect x="6" y="6" width="7" height="7" rx="2" fill="white" opacity="0.9" />
                <rect x="15" y="6" width="7" height="7" rx="2" fill="white" opacity="0.6" />
                <rect x="6" y="15" width="7" height="7" rx="2" fill="white" opacity="0.6" />
                <rect x="15" y="15" width="7" height="7" rx="2" fill="white" opacity="0.3" />
              </svg>
              <span>KDeck</span>
            </Link>
            <p className="footer-tagline">
              A programmable control surface for every workflow.
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((col) => (
            <div key={col.heading} className="footer-link-col">
              <p className="footer-col-heading">{col.heading}</p>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} KDeck. All rights reserved.</p>
          <p className="footer-bottom-links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
