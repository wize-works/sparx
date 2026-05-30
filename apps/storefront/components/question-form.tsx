'use client';

// Ask-a-question form for the PDP. Posts to the public questions endpoint via
// the same-origin proxy; questions enter moderation, so on success we show a
// "thanks, pending" state rather than inserting it into the list. A signed-in
// shopper is attributed server-side via the session cookie; guests give a name.

import { useState } from 'react';

const API_BASE = '/api/sparx';

export function QuestionForm({ tenantSlug, handle }: { tenantSlug: string; handle: string }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/products/${encodeURIComponent(handle)}/questions?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ displayName: displayName || undefined, body }),
        }
      );
      const json = (await res.json().catch(() => null)) as
        | { success: true }
        | { success: false; error: { message: string } }
        | null;
      if (!res.ok || !json || json.success === false) {
        throw new Error(json?.success === false ? json.error.message : 'Could not submit.');
      }
      setState('done');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div
        className="sf-alert"
        style={{ background: 'var(--color-success-tint)', color: 'var(--color-success-text)' }}
      >
        Thanks for your question! It’ll appear once it’s answered.
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="sf-btn sf-btn--secondary" onClick={() => setOpen(true)}>
        Ask a question
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="sf-form">
      <label className="sf-field">
        <span>Name (optional)</span>
        <input
          className="sf-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <label className="sf-field">
        <span>Your question</span>
        <textarea
          className="sf-input"
          required
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {error ? (
        <div className="sf-alert sf-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" className="sf-btn sf-btn--ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="sf-btn sf-btn--primary" disabled={state === 'busy'}>
          {state === 'busy' ? 'Submitting…' : 'Submit question'}
        </button>
      </div>
    </form>
  );
}
