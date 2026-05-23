'use client';

import { FormEvent, useState } from 'react';

export function RevealLicenseKey({ licenseKey }: { licenseKey: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!licenseKey) {
    return <p className="fine-print">No license key is available for this account yet.</p>;
  }

  async function copy() {
    setRevealed(true);
    await navigator.clipboard?.writeText(licenseKey ?? '');
    setMessage('Copied to clipboard.');
  }

  return (
    <div className="dashboard-action-stack">
      <code className="license-key">{revealed ? licenseKey : maskLicenseKey(licenseKey)}</code>
      <div className="inline-actions">
        <button className="secondary" type="button" onClick={() => setRevealed((value) => !value)}>
          {revealed ? 'Hide key' : 'Reveal key'}
        </button>
        <button className="primary compact" type="button" onClick={copy}>
          Copy key
        </button>
      </div>
      {message && <p className="fine-print">{message}</p>}
    </div>
  );
}

export function ResendKeyButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setStatus('loading');
    setError(null);
    const response = await fetch('/api/dashboard/resend-key', { method: 'POST' });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string; message?: string };
      setError(data.message ?? data.error ?? 'Could not resend key.');
      setStatus('idle');
      return;
    }
    setStatus('sent');
  }

  return (
    <div>
      <button className="primary compact" type="button" onClick={resend} disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending...' : 'Resend key'}
      </button>
      {status === 'sent' && <p className="fine-print">License key sent if a license exists.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function StartCheckoutButton({
  plan,
  label,
}: {
  plan: 'ai_pro_monthly' | 'ai_pro_yearly';
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    const response = await fetch('/api/paymob/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const data = (await response.json()) as { checkoutUrl?: string; error?: string };
    if (!response.ok || !data.checkoutUrl) {
      setError(data.error ?? 'Could not start checkout.');
      setLoading(false);
      return;
    }
    window.location.assign(data.checkoutUrl);
  }

  return (
    <div>
      <button className="primary compact" type="button" onClick={startCheckout} disabled={loading}>
        {loading ? 'Opening Paymob...' : label}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function CancelSubscriptionButton({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm('Cancel AI Pro for this account?')) return;
    setStatus('loading');
    setError(null);
    const response = await fetch('/api/dashboard/cancel-subscription', { method: 'POST' });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string; message?: string };
      setError(data.message ?? data.error ?? 'Could not cancel subscription.');
      setStatus('idle');
      return;
    }
    setStatus('done');
    window.location.reload();
  }

  return (
    <div>
      <button className="secondary danger" type="button" onClick={cancel} disabled={disabled || status === 'loading'}>
        {status === 'loading' ? 'Cancelling...' : 'Cancel subscription'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function DeleteAccountButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm('Revoke your license and delete this account session?')) return;
    setLoading(true);
    setError(null);
    const response = await fetch('/api/dashboard/account', { method: 'DELETE' });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string; message?: string };
      setError(data.message ?? data.error ?? 'Could not delete account.');
      setLoading(false);
      return;
    }
    window.location.assign('/');
  }

  return (
    <div>
      <button className="secondary danger" type="button" onClick={remove} disabled={loading}>
        {loading ? 'Deleting...' : 'Delete account'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function PasswordSetupForm({ required }: { required?: boolean }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setStatus('saving');
    const response = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(data.error === 'WEAK_PASSWORD' ? 'Password must be at least 8 characters.' : (data.error ?? 'Could not save password.'));
      setStatus('idle');
      return;
    }

    setPassword('');
    setConfirmPassword('');
    setStatus('saved');
  }

  return (
    <form className="dashboard-action-stack" onSubmit={save}>
      {required && (
        <p className="notice-banner">
          Create a password to finish moving this account from magic-link sign-in to password sign-in.
        </p>
      )}
      <label className="field">
        <span>New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={8}
        />
      </label>
      <button className="primary compact" type="submit" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving...' : 'Save password'}
      </button>
      {status === 'saved' && <p className="fine-print">Password saved. Use it the next time you sign in.</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function LogoutButton() {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  return (
    <button className="secondary compact" type="button" onClick={logout}>
      Sign out
    </button>
  );
}

function maskLicenseKey(key: string): string {
  return `${key.slice(0, 7)}****-****-****-${key.slice(-4)}`;
}
