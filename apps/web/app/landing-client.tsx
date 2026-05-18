'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { PurchasePanel, PurchasePlanOption } from './purchase-panel';
import type { PlanConfig } from '@/lib/plans';

interface LandingClientProps {
  plans:    (PurchasePlanOption & { highlighted?: boolean })[];
  currency: string;
  desktop:  PlanConfig;
  aiPro:    PlanConfig;
}

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: 'Desktop Agent',
    body:  'Lightweight background process that executes actions instantly — launch apps, run scripts, trigger shortcuts.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M9 7h6M9 11h6M9 15h4" />
      </svg>
    ),
    title: 'Mobile Deck Remote',
    body:  'Your phone becomes a customisable deck. Tap tiles to fire actions on your desktop in real time.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
        <path d="M8 12s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
    title: 'AI Assistant',
    body:  'Built-in AI that understands context — ask questions, generate content, run automations without leaving your deck.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: 'Custom Tile Library',
    body:  'Design each tile: icon, label, action. Group by workflow — gaming, coding, streaming, creative work.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: 'Script Execution',
    body:  'Map tiles to shell commands, PowerShell scripts, AppleScript, or any executable — full system access.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
    title: 'App Search & Launch',
    body:  'Instantly search and open any installed app — Steam, Epic, native apps — right from your tile grid.',
  },
];

const STEPS = [
  { num: '01', title: 'Buy a license',    body: 'One-time payment. Your license key arrives by email immediately after payment.' },
  { num: '02', title: 'Install KDeck',    body: 'Download the desktop agent for Windows or macOS. Launch and enter your key.' },
  { num: '03', title: 'Connect & go',     body: 'Open the mobile app, pair with your desktop, and start building your deck.' },
];

export function LandingClient({ plans, desktop, aiPro }: LandingClientProps) {
  const shouldReduceMotion = useReducedMotion();

  const fadeUp = (delay = 0) => ({
    initial:    shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport:   { once: true, amount: 0.2 },
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const, delay },
  });

  const staggerContainer = {
    initial:    {},
    whileInView: {},
    viewport:   { once: true, amount: 0.1 },
  };

  const staggerItem = (i: number) => ({
    initial:    shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport:   { once: true, amount: 0.1 },
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const, delay: i * 0.07 },
  });

  return (
    <main>
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-shell">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <motion.p className="landing-eyebrow" {...fadeUp(0)}>
                Desktop automation for power users
              </motion.p>
              <motion.h1 className="landing-headline" {...fadeUp(0.06)}>
                Your deck.<br />Your rules.
              </motion.h1>
              <motion.p className="landing-summary" {...fadeUp(0.12)}>
                KDeck turns your phone into a programmable control surface for your desktop.
                Custom tiles, AI assistant, instant shortcuts — built for developers, gamers,
                streamers, and anyone who demands more from their workflow.
              </motion.p>
              <motion.div className="landing-hero-metrics" {...fadeUp(0.18)}>
                <div className="landing-metric">
                  <strong>{desktop.desktopMonthlyAiCredits}</strong>
                  <span>AI calls/month included</span>
                </div>
                <div className="landing-metric">
                  <strong>{aiPro.monthlyAiCredits}</strong>
                  <span>AI Pro monthly credits</span>
                </div>
                <div className="landing-metric">
                  <strong>∞</strong>
                  <span>Custom tiles</span>
                </div>
              </motion.div>
              <motion.div className="landing-hero-actions" {...fadeUp(0.22)}>
                <a href="#pricing" className="landing-btn-primary">
                  Get KDeck
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
                <a href="/setup" className="landing-btn-ghost">
                  Download free trial
                </a>
              </motion.div>
            </div>

            {/* Purchase panel */}
            <motion.div
              className="landing-hero-panel"
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const, delay: 0.1 }}
            >
              <PurchasePanel plans={plans} />
            </motion.div>
          </div>
        </div>

        {/* Background grid decoration */}
        <div className="hero-grid-bg" aria-hidden="true" />
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section className="landing-section" id="features">
        <div className="landing-shell">
          <motion.div className="landing-section-header" {...fadeUp()}>
            <p className="landing-eyebrow">Capabilities</p>
            <h2 className="landing-section-title">Everything your workflow demands</h2>
          </motion.div>

          <motion.div className="landing-features-grid" {...staggerContainer}>
            {FEATURES.map((feat, i) => (
              <motion.article key={feat.title} className="feature-card" {...staggerItem(i)}>
                <div className="feature-icon" aria-hidden="true">{feat.icon}</div>
                <h3>{feat.title}</h3>
                <p>{feat.body}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────── */}
      <section className="landing-section landing-section-alt">
        <div className="landing-shell">
          <motion.div className="landing-section-header" {...fadeUp()}>
            <p className="landing-eyebrow">Setup in minutes</p>
            <h2 className="landing-section-title">From purchase to running in 3 steps</h2>
          </motion.div>

          <div className="landing-steps">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} className="landing-step" {...staggerItem(i)}>
                <span className="step-num">{step.num}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div className="landing-step-cta" {...fadeUp(0.2)}>
            <a href="/setup" className="landing-btn-ghost">
              View full setup guide
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────── */}
      <section className="landing-section" id="pricing">
        <div className="landing-shell">
          <motion.div className="landing-section-header" {...fadeUp()}>
            <p className="landing-eyebrow">Pricing</p>
            <h2 className="landing-section-title">One license, your machine, forever</h2>
            <p className="landing-section-sub">
              No subscription required for the desktop license. Upgrade to AI Pro when you&apos;re ready.
            </p>
          </motion.div>

          <motion.div className="landing-pricing-wrap" {...fadeUp(0.1)}>
            <PurchasePanel plans={plans} />
          </motion.div>
        </div>
      </section>
    </main>
  );
}
