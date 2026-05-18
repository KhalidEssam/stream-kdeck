'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

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
        <p>Use the email connected to your Control Surface purchase.</p>
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
