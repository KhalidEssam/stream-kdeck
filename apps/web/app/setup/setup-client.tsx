'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

const STEPS = [
  {
    num:   '01',
    title: 'Download the desktop agent',
    body:  'The KDeck agent runs in your system tray. It handles all actions — launching apps, running scripts, relaying commands from your phone.',
    action: (
      <div className="setup-downloads">
        <a href="#download-windows" className="setup-download-btn" aria-label="Download for Windows">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
          Windows
          <span className="setup-dl-badge">x64</span>
        </a>
        <a href="#download-mac" className="setup-download-btn" aria-label="Download for macOS">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>
          macOS
          <span className="setup-dl-badge">Apple Silicon / Intel</span>
        </a>
      </div>
    ),
  },
  {
    num:   '02',
    title: 'Install and launch',
    body:  'Run the installer. KDeck Agent will appear in your system tray (Windows) or menu bar (macOS). On first launch it will ask for your license key.',
    action: null,
  },
  {
    num:   '03',
    title: 'Enter your license key',
    body:  'Paste the key from your purchase confirmation email. The agent verifies it with our server and activates immediately.',
    action: (
      <div className="setup-callout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>No license yet? <Link href="/#pricing">Buy one here</Link> — your key arrives by email in seconds.</p>
      </div>
    ),
  },
  {
    num:   '04',
    title: 'Install the mobile app',
    body:  "Download KDeck on your phone. Open the app and it will auto-discover your desktop on the same Wi-Fi network. Tap Connect and you're live.",
    action: (
      <div className="setup-downloads">
        <a href="#app-store" className="setup-download-btn" aria-label="Download on the App Store">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
          App Store
        </a>
        <a href="#google-play" className="setup-download-btn" aria-label="Get it on Google Play">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.18 23.76c.3.17.65.2.97.08l.06-.04 11.38-6.57-2.48-2.49-9.93 9zM.61 1.23C.23 1.56 0 2.1 0 2.8v18.4c0 .7.23 1.24.61 1.57l.08.07L11.3 12 .69 1.16l-.08.07zm20.07 9.4l-2.89-1.67-2.77 2.77 2.77 2.77 2.9-1.68c.83-.48.83-1.26-.01-1.19zM4.15.24l.06.04 11.38 6.57-2.48 2.49L4.15.24z"/></svg>
          Google Play
        </a>
      </div>
    ),
  },
  {
    num:   '05',
    title: 'Build your deck',
    body:  'Long-press any tile to customise it. Add app launchers, scripts, AI prompts, or shortcuts. Pin your most-used tiles to the top.',
    action: null,
  },
];

const REQUIREMENTS = [
  { platform: 'Windows', req: 'Windows 10 or later, x64' },
  { platform: 'macOS',   req: 'macOS 12 Monterey or later' },
  { platform: 'iOS',     req: 'iOS 16 or later' },
  { platform: 'Android', req: 'Android 10 or later' },
];

export function SetupClient() {
  const shouldReduceMotion = useReducedMotion();

  const fadeUp = (delay = 0) => ({
    initial:    shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport:   { once: true, amount: 0.15 },
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const, delay },
  });

  return (
    <main className="setup-page">
      <div className="landing-shell">

        {/* Header */}
        <motion.div className="setup-header" {...fadeUp()}>
          <p className="landing-eyebrow">Download & Setup</p>
          <h1 className="setup-headline">Get KDeck running<br />in minutes</h1>
          <p className="setup-sub">
            Desktop agent + mobile app. Works on Windows, macOS, iOS, and Android.
          </p>
        </motion.div>

        {/* Quick download strip */}
        <motion.div className="setup-quick-dl" {...fadeUp(0.08)} id="download">
          <a href="#download-windows" className="setup-quick-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
            Download for Windows
          </a>
          <a href="#download-mac" className="setup-quick-btn setup-quick-btn-ghost">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>
            Download for macOS
          </a>
        </motion.div>

        {/* Steps */}
        <div className="setup-steps" id="install">
          {STEPS.map((step, i) => (
            <motion.div key={step.num} className="setup-step" {...fadeUp(i * 0.06)}>
              <div className="setup-step-num">{step.num}</div>
              <div className="setup-step-body">
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                {step.action && <div className="setup-step-action">{step.action}</div>}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Requirements */}
        <motion.div className="setup-requirements" {...fadeUp()}>
          <h2 className="setup-req-title">System requirements</h2>
          <div className="setup-req-grid">
            {REQUIREMENTS.map((r) => (
              <div key={r.platform} className="setup-req-row">
                <span className="setup-req-platform">{r.platform}</span>
                <span className="setup-req-spec">{r.req}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Need a license? */}
        <motion.div className="setup-license-cta" {...fadeUp()}>
          <div>
            <h3>Don&apos;t have a license yet?</h3>
            <p>One-time purchase. Your key arrives instantly by email.</p>
          </div>
          <Link href="/#pricing" className="landing-btn-primary">
            Buy a license
          </Link>
        </motion.div>

      </div>
    </main>
  );
}
