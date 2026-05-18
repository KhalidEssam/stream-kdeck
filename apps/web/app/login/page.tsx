'use client';

import { FormEvent, useEffect, useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle');
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
        window.location.assign('/dashboard');
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
    setError(null);
    setStatus('loading');

    const response = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(data.error ?? 'Could not send sign-in link.');
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
            : 'Use the email connected to your Control Surface purchase.'}
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
        {error && <div className="error">{error}</div>}
        {status === 'sent' && (
          <div className="fine-print">Check your inbox for the sign-in link.</div>
        )}
        <button className="primary" type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Sending...' : 'Send sign-in link'}
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
