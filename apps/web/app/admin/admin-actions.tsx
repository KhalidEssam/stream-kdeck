'use client';

import { FormEvent, useState } from 'react';
import { PlatformConfigRow } from '@/lib/platform-config';

export function LicenseActions({ id }: { id: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'revoke' | 'reset_credits') {
    setLoading(action);
    setError(null);
    const response = await fetch(`/api/admin/licenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string; message?: string };
      setError(data.message ?? data.error ?? 'Action failed.');
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="inline-actions">
      <button className="secondary danger" type="button" onClick={() => run('revoke')} disabled={loading !== null}>
        {loading === 'revoke' ? 'Revoking...' : 'Revoke'}
      </button>
      <button className="secondary" type="button" onClick={() => run('reset_credits')} disabled={loading !== null}>
        {loading === 'reset_credits' ? 'Resetting...' : 'Reset credits'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function PlatformConfigForm({ rows }: { rows: PlatformConfigRow[] }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    setError(null);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(rows.map((row) => [row.key, String(form.get(row.key) ?? '')]));
    const response = await fetch('/api/admin/platform', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string; message?: string };
      setError(data.message ?? data.error ?? 'Could not save config.');
      setStatus('idle');
      return;
    }
    setStatus('saved');
  }

  return (
    <form className="config-form" onSubmit={submit}>
      {rows.map((row) => (
        <label key={row.key} className="field">
          <span>{row.label}</span>
          <input name={row.key} defaultValue={row.value} inputMode="numeric" pattern="[0-9]+" />
          <small>{row.description}</small>
        </label>
      ))}
      {error && <p className="error">{error}</p>}
      {status === 'saved' && <p className="fine-print">Saved.</p>}
      <button className="primary compact" type="submit" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving...' : 'Save config'}
      </button>
    </form>
  );
}
