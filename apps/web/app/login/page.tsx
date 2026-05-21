'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type AuthMode = 'password' | 'magic';
type Status = 'idle' | 'loading' | 'sent';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = readUrlSessionParams();
    if (!params) return;

    let cancelled = false;
    setStatus('loading');
    setError(null);

    fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? 'Could not finish sign-in.');
        }
        window.history.replaceState(null, '', '/login');
        window.location.assign('/dashboard/account?password=required');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('idle');
        setError(err instanceof Error ? err.message : 'Could not finish sign-in.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'magic') {
      await submitMagicLink();
      return;
    }

    await submitPassword();
  }

  async function submitPassword() {
    setError(null);
    setStatus('loading');

    const response = await fetch('/api/auth/password-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(
        data.error === 'NO_ACCOUNT'
          ? 'NO_ACCOUNT'
          : 'Invalid email or password. If you have not created a password yet, use a sign-in link.',
      );
      setStatus('idle');
      return;
    }

    window.location.assign('/dashboard');
  }

  async function submitMagicLink() {
    setError(null);
    setStatus('loading');

    const response = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(data.error === 'NO_ACCOUNT' ? 'NO_ACCOUNT' : (data.error ?? 'Could not send sign-in link.'));
      setStatus('idle');
      return;
    }

    setStatus('sent');
  }

  return (
    <main className="status-page">
      <form className="status-card" onSubmit={submit}>
        <p className="eyebrow">Customer sign in</p>
        <h1>Open your dashboard</h1>
        <p>
          {status === 'loading'
            ? 'Finishing secure sign-in...'
            : mode === 'password'
              ? 'Sign in with your KDeck account password.'
              : 'Use the email connected to your KDeck purchase.'}
        </p>
        <label className="field">
          <span>Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>
        {mode === 'password' && (
          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
        )}
        {error && error !== 'NO_ACCOUNT' && <div className="error">{error}</div>}
        {error === 'NO_ACCOUNT' && (
          <div className="error">
            No account found for that email.{' '}
            <Link href="/#pricing" className="error-link">Get a license</Link>{' '}
            or check the email on your purchase confirmation.
          </div>
        )}
        {status === 'sent' && (
          <div className="fine-print">Check your inbox - the sign-in link expires in 10 minutes.</div>
        )}
        <button className="primary" type="submit" disabled={status === 'loading'}>
          {status === 'loading'
            ? mode === 'password' ? 'Signing in...' : 'Sending...'
            : mode === 'password' ? 'Sign in' : 'Send sign-in link'}
        </button>
        <button
          className="link-btn"
          type="button"
          onClick={() => {
            setMode((current) => current === 'password' ? 'magic' : 'password');
            setError(null);
            setStatus('idle');
          }}
        >
          {mode === 'password' ? 'No password yet? Use a sign-in link' : 'Use password instead'}
        </button>
      </form>
    </main>
  );
}

function readUrlSessionParams(): {
  access_token: string;
  refresh_token: string;
  expires_in?: string;
} | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  const accessToken = hash.get('access_token') ?? search.get('access_token');
  const refreshToken = hash.get('refresh_token') ?? search.get('refresh_token');
  const expiresIn = hash.get('expires_in') ?? search.get('expires_in') ?? undefined;

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
  };
}
