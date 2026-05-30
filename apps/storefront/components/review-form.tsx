'use client';

// Write-a-review form for the PDP. Submits to the public reviews endpoint via
// the same-origin proxy; reviews enter moderation, so on success we show a
// "thanks, pending" state rather than optimistically inserting the review.

import { useState } from 'react';

const API_BASE = '/api/sparx';

export function ReviewForm({ tenantSlug, handle }: { tenantSlug: string; handle: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/products/${encodeURIComponent(handle)}/reviews?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            rating,
            authorName,
            authorEmail,
            title: title || undefined,
            body,
          }),
        }
      );
      const json = (await res.json().catch(() => null)) as
        | { success: true }
        | { success: false; error: { message: string } }
        | null;
      if (!res.ok || !json || json.success === false) {
        throw new Error(json && json.success === false ? json.error.message : 'Could not submit.');
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
        Thanks for your review! It’ll appear once it’s approved.
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="sf-btn sf-btn--secondary" onClick={() => setOpen(true)}>
        Write a review
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="sf-form">
      <label className="sf-field">
        <span>Rating</span>
        <select
          className="sf-input"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <label className="sf-field" style={{ flex: 1 }}>
          <span>Name</span>
          <input
            className="sf-input"
            required
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
          />
        </label>
        <label className="sf-field" style={{ flex: 1 }}>
          <span>Email</span>
          <input
            className="sf-input"
            type="email"
            required
            value={authorEmail}
            onChange={(e) => setAuthorEmail(e.target.value)}
          />
        </label>
      </div>
      <label className="sf-field">
        <span>Title (optional)</span>
        <input className="sf-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="sf-field">
        <span>Review</span>
        <textarea
          className="sf-input"
          required
          rows={4}
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
          {state === 'busy' ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
    </form>
  );
}
