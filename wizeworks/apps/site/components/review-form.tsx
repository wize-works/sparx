'use client';

// Write-a-review form for the PDP. Submits to the public reviews endpoint via
// the same-origin proxy; reviews enter moderation, so on success we show a
// "thanks, pending" state rather than optimistically inserting the review.

import { useState } from 'react';

import { Alert, Button, Input, Textarea } from '@wizeworks/silicaui-react';

const API_BASE = '/api/sparx';

// Interactive star rating. Native radios (one per star) keep it fully keyboard-
// and screen-reader-accessible — arrow keys move between stars, the group is
// labelled by the legend — while the visible glyphs fill on hover/selection.
function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value; // hover preview wins, else the committed value
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
      onMouseLeave={() => setHover(0)}
    >
      <legend className="text-base-content p-0 text-sm font-medium">Rating</legend>
      <div className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={
              shown >= n
                ? 'rounded-field text-warning focus-within:outline-primary cursor-pointer text-[1.6rem] leading-none transition-colors focus-within:outline-2 focus-within:outline-offset-2'
                : 'rounded-field text-base-content/35 focus-within:outline-primary cursor-pointer text-[1.6rem] leading-none transition-colors focus-within:outline-2 focus-within:outline-offset-2'
            }
            onMouseEnter={() => setHover(n)}
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <span aria-hidden="true">★</span>
            <span className="sr-only">
              {n} star{n === 1 ? '' : 's'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

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
            authorEmail: authorEmail || undefined,
            title: title || undefined,
            body,
          }),
        }
      );
      const json = (await res.json().catch(() => null)) as
        { success: true } | { success: false; error: { message: string } } | null;
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
    return <Alert color="success">Thanks for your review! It’ll appear once it’s approved.</Alert>;
  }

  if (!open) {
    return (
      <Button type="button" color="neutral" variant="outline" onClick={() => setOpen(true)}>
        Write a review
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-[560px] flex-col gap-4">
      <StarRating value={rating} onChange={setRating} />
      <div className="flex gap-3">
        <label className="[&>span]:text-base-content flex flex-1 flex-col gap-1.5 [&>span]:text-sm [&>span]:font-medium">
          <span>Name</span>
          <Input required value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
        </label>
        <label className="[&>span]:text-base-content flex flex-1 flex-col gap-1.5 [&>span]:text-sm [&>span]:font-medium">
          <span>Email (optional)</span>
          <Input
            type="email"
            value={authorEmail}
            onChange={(e) => setAuthorEmail(e.target.value)}
          />
        </label>
      </div>
      <label className="[&>span]:text-base-content flex flex-col gap-1.5 [&>span]:text-sm [&>span]:font-medium">
        <span>Title (optional)</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="[&>span]:text-base-content flex flex-col gap-1.5 [&>span]:text-sm [&>span]:font-medium">
        <span>Review</span>
        <Textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {error ? (
        <Alert color="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <div className="flex gap-3">
        <Button type="button" color="neutral" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" color="primary" disabled={state === 'busy'}>
          {state === 'busy' ? 'Submitting…' : 'Submit review'}
        </Button>
      </div>
    </form>
  );
}
