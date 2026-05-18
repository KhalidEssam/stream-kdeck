'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useState } from 'react';

const NAV_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/setup', label: 'Download' },
  { href: '/#pricing', label: 'Pricing' },
];

interface NavbarProps {
  isLoggedIn?: boolean;
}

export function Navbar({ isLoggedIn = false }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const { scrollY } = useScroll();

  const borderOpacity = useTransform(scrollY, [0, 60], [0, 1]);
  const bgOpacity     = useTransform(scrollY, [0, 80], [0, 0.92]);

  const isPublicPage = !pathname.startsWith('/dashboard') && !pathname.startsWith('/admin');

  if (!isPublicPage) return null;

  return (
    <>
      <motion.header
        className="navbar"
        style={{
          '--nav-bg-opacity': bgOpacity,
          '--nav-border-opacity': borderOpacity,
        } as React.CSSProperties}
      >
        <div className="navbar-shell">
          {/* Brand */}
          <Link href="/" className="navbar-brand" aria-label="KDeck home">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <rect width="28" height="28" rx="7" fill="var(--accent)" />
              <rect x="6" y="6" width="7" height="7" rx="2" fill="white" opacity="0.9" />
              <rect x="15" y="6" width="7" height="7" rx="2" fill="white" opacity="0.6" />
              <rect x="6" y="15" width="7" height="7" rx="2" fill="white" opacity="0.6" />
              <rect x="15" y="15" width="7" height="7" rx="2" fill="white" opacity="0.3" />
            </svg>
            <span className="navbar-wordmark">KDeck</span>
          </Link>

          {/* Desktop nav */}
          <nav className="navbar-links" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="navbar-link">
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA */}
          <div className="navbar-actions">
            {isLoggedIn ? (
              <Link href="/dashboard" className="navbar-cta-ghost">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="navbar-cta-ghost">
                Sign in
              </Link>
            )}
            <Link href="/#pricing" className="navbar-cta">
              Get KDeck
            </Link>

            {/* Mobile hamburger */}
            <button
              className="navbar-burger"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <motion.span
                className="burger-line"
                animate={menuOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
              />
              <motion.span
                className="burger-line"
                animate={menuOpen ? { opacity: 0 } : { opacity: 1 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
              />
              <motion.span
                className="burger-line"
                animate={menuOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
              />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="mobile-menu"
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <nav aria-label="Mobile navigation">
              {NAV_LINKS.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.2 }}
                >
                  <Link
                    href={link.href}
                    className="mobile-menu-link"
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mobile-menu-actions">
                {isLoggedIn ? (
                  <Link href="/dashboard" className="navbar-cta-ghost mobile-full" onClick={() => setMenuOpen(false)}>
                    Dashboard
                  </Link>
                ) : (
                  <Link href="/login" className="navbar-cta-ghost mobile-full" onClick={() => setMenuOpen(false)}>
                    Sign in
                  </Link>
                )}
                <Link href="/#pricing" className="navbar-cta mobile-full" onClick={() => setMenuOpen(false)}>
                  Get KDeck
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
