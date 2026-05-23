'use client';

import { FormEvent, useId, useState } from 'react';

type PlanId = 'desktop_license' | 'ai_pro_monthly' | 'ai_pro_yearly';
type AiCycle = 'monthly' | 'yearly';

export interface PurchasePlanOption {
  id: PlanId;
  name: string;
  price: string;
  /** First-payment total when this AI Pro plan is bundled with the desktop license. */
  combinedPrice?: string;
  copy: string;
}

export function PurchasePanel({
  plans,
  currentUserEmail,
}: {
  plans: PurchasePlanOption[];
  currentUserEmail?: string | null;
}) {
  const emailId = useId();
  const passwordId = useId();
  const [addAiPro, setAddAiPro] = useState(false);
  const [aiCycle, setAiCycle] = useState<AiCycle>('monthly');
  const [email, setEmail] = useState(currentUserEmail ?? '');
  const [password, setPassword] = useState('');
  const [signedInEmail, setSignedInEmail] = useState(currentUserEmail ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const desktop = plans.find((p) => p.id === 'desktop_license');
  const aiMonthly = plans.find((p) => p.id === 'ai_pro_monthly');
  const aiYearly = plans.find((p) => p.id === 'ai_pro_yearly');

  const activePlanId: PlanId = addAiPro
    ? aiCycle === 'yearly' ? 'ai_pro_yearly' : 'ai_pro_monthly'
    : 'desktop_license';

  const addonPlan = addAiPro ? (aiCycle === 'yearly' ? aiYearly : aiMonthly) : null;
  const ctaPrice = addAiPro
    ? (addonPlan?.combinedPrice ?? addonPlan?.price)
    : desktop?.price;
  const isSignedIn = signedInEmail !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!isSignedIn) {
        const accountEmail = await createPurchaseSession();
        setSignedInEmail(accountEmail);
        setEmail(accountEmail);
      }

      await startCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setLoading(false);
    }
  }

  async function createPurchaseSession(): Promise<string> {
    const res = await fetch('/api/auth/purchase-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as { email?: string; error?: string; message?: string };

    if (!res.ok || !data.email) {
      throw new Error(formatPurchaseAuthError(data));
    }

    return data.email;
  }

  async function startCheckout(): Promise<void> {
    const res = await fetch('/api/paymob/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: activePlanId }),
    });
    const data = (await res.json()) as { checkoutUrl?: string; error?: string; message?: string };
    if (!res.ok || !data.checkoutUrl) {
      if (data.error === 'UNAUTHENTICATED') {
        setSignedInEmail(null);
      }
      throw new Error(data.message ?? data.error ?? 'Unable to start checkout.');
    }

    window.location.assign(data.checkoutUrl);
  }

  return (
    <form className="panel checkout-v2" onSubmit={handleSubmit}>
      <div className="cv2-step">
        <p className="cv2-step-label">Step 1 - Required</p>
        <div className="cv2-base-card">
          <div className="cv2-base-top">
            <span className="cv2-base-name">Desktop License</span>
            <span className="cv2-base-price">{desktop?.price ?? '-'}</span>
          </div>
          <p className="cv2-base-desc">
            One-time purchase. Unlocks the agent, mobile app pairing, custom tiles,
            script execution, and {desktop?.copy?.match(/(\d+) AI/)?.[1] ?? '50'} AI calls/month.
          </p>
          <div className="cv2-base-badge">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" />
              <path d="M3.5 6 L5.5 8 L8.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Always included
          </div>
        </div>
      </div>

      <div className="cv2-divider">
        <span>Optional add-on</span>
      </div>

      <div className="cv2-step">
        <p className="cv2-step-label">Step 2 - Optional</p>

        <label className="cv2-toggle-row">
          <span className="cv2-toggle-label">
            <strong>Add AI Pro</strong>
            <span className="cv2-toggle-sub">More AI credits, priority model access</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={addAiPro}
            className="cv2-toggle"
            data-on={addAiPro}
            onClick={() => setAddAiPro((v) => !v)}
          >
            <span className="cv2-toggle-thumb" />
          </button>
        </label>

        {addAiPro && (
          <div className="cv2-cycle-wrap">
            <button
              type="button"
              className="cv2-cycle-btn"
              data-active={aiCycle === 'monthly'}
              onClick={() => setAiCycle('monthly')}
            >
              <span className="cv2-cycle-name">Monthly</span>
              <span className="cv2-cycle-price">{aiMonthly?.price ?? '-'}</span>
              <span className="cv2-cycle-note">Billed monthly - cancel anytime</span>
            </button>
            <button
              type="button"
              className="cv2-cycle-btn"
              data-active={aiCycle === 'yearly'}
              onClick={() => setAiCycle('yearly')}
            >
              <span className="cv2-cycle-name">Yearly</span>
              <span className="cv2-cycle-price">{aiYearly?.price ?? '-'}</span>
              <span className="cv2-cycle-note">Best value - about 38% off</span>
              <span className="cv2-cycle-badge">Save 38%</span>
            </button>
          </div>
        )}
      </div>

      <div className="cv2-foot">
        {isSignedIn ? (
          <div className="cv2-account-note">
            <span>Purchasing as</span>
            <strong>{signedInEmail}</strong>
          </div>
        ) : (
          <div className="cv2-auth-grid">
            <div className="field">
              <label htmlFor={emailId}>Email</label>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor={passwordId}>Password</label>
              <input
                id={passwordId}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </div>
            <p className="fine-print cv2-auth-copy">
              Use your existing KDeck account password, or create a new account before checkout.
            </p>
          </div>
        )}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? (isSignedIn ? 'Opening Paymob...' : 'Preparing checkout...') : (
            addAiPro
              ? `Buy Desktop + AI Pro - ${ctaPrice}`
              : `Buy Desktop License - ${ctaPrice}`
          )}
        </button>

        {error && <div className="error">{error}</div>}

        <p className="fine-print">
          {addAiPro
            ? `First charge includes the one-time desktop license (${desktop?.price}) + first ${aiCycle === 'yearly' ? 'year' : 'month'} of AI Pro (${addonPlan?.price}). Subscription renews automatically.`
            : 'One-time purchase. Add AI Pro anytime from your dashboard.'}
        </p>
      </div>
    </form>
  );
}

function formatPurchaseAuthError(data: { error?: string; message?: string }): string {
  if (data.message) return data.message;

  switch (data.error) {
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.';
    case 'WEAK_PASSWORD':
      return 'Password must be at least 8 characters.';
    case 'INVALID_CREDENTIALS':
      return 'That email already has an account. Enter its password to continue.';
    case 'ACCOUNT_CREATE_FAILED':
      return 'Could not create an account for checkout.';
    default:
      return 'Could not prepare your account for checkout.';
  }
}
