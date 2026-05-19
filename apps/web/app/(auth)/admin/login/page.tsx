'use client';

import { FormEvent, useState } from 'react';

type Step = 'credentials' | 'mfa';

interface MfaState {
  factorId: string;
  challengeId: string;
  tempAccessToken: string;
  tempRefreshToken: string;
}

export default function AdminLoginPage() {
  const [step, setStep]         = useState<Step>('credentials');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]         = useState('');
  const [mfa, setMfa]           = useState<MfaState | null>(null);
  const [mfaWarning, setMfaWarning] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as {
      error?: string;
      mfaRequired?: boolean;
      mfaWarning?: boolean;
      factorId?: string;
      challengeId?: string;
      tempAccessToken?: string;
      tempRefreshToken?: string;
    };

    if (!response.ok) {
      setError(data.error === 'FORBIDDEN' ? 'This account does not have staff access.' : 'Invalid email or password.');
      setLoading(false);
      return;
    }

    if (data.mfaRequired && data.factorId && data.challengeId && data.tempAccessToken && data.tempRefreshToken) {
      setMfa({
        factorId: data.factorId,
        challengeId: data.challengeId,
        tempAccessToken: data.tempAccessToken,
        tempRefreshToken: data.tempRefreshToken,
      });
      setStep('mfa');
      setLoading(false);
      return;
    }

    if (data.mfaWarning) {
      setMfaWarning(true);
    }
    window.location.assign('/admin');
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfa) return;
    setError(null);
    setLoading(true);

    const response = await fetch('/api/auth/admin-mfa-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mfa, code }),
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(data.error === 'INVALID_CODE' ? 'Incorrect code — try again.' : 'Verification failed.');
      setLoading(false);
      return;
    }

    window.location.assign('/admin');
  }

  if (step === 'mfa') {
    return (
      <main className="status-page">
        <form className="status-card" onSubmit={submitMfa}>
          <p className="eyebrow">Staff · Two-factor</p>
          <h1>Enter authenticator code</h1>
          <p>Open your authenticator app and enter the 6-digit code.</p>
          <label className="field">
            <span>Authenticator code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              required
              autoFocus
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => { setStep('credentials'); setError(null); setCode(''); }}
          >
            Back to sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="status-page">
      <form className="status-card" onSubmit={submitCredentials}>
        <p className="eyebrow">Staff</p>
        <h1>Admin sign in</h1>
        {mfaWarning && (
          <div className="notice-banner" role="alert">
            MFA is not configured on this account. Set up an authenticator app in Account settings.
          </div>
        )}
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
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
