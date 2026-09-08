'use client';

// Ask-a-question form for the PDP. Posts to the public questions endpoint via
// the same-origin proxy; questions enter moderation, so on success we show a
// "thanks, pending" state rather than inserting it into the list. A signed-in
// shopper is attributed server-side via the session cookie; guests give a name.

import { useState } from 'react';

import { Alert, Button, Input, Textarea } from '@wizeworks/silicaui-react';

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
    return (
      <Alert color="success" role="status">
        Thanks for your question! It’ll appear once it’s answered.
      </Alert>
    );
  }

  if (!open) {
    return (
      <Button type="button" color="neutral" variant="outline" onClick={() => setOpen(true)}>
        Ask a question
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-[560px] flex-col gap-4">
      <label className="[&>span]:text-base-content flex flex-col gap-1.5 [&>span]:text-sm [&>span]:font-medium">
        <span>Name (optional)</span>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="[&>span]:text-base-content flex flex-col gap-1.5 [&>span]:text-sm [&>span]:font-medium">
        <span>Your question</span>
        <Textarea required rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {error ? <Alert color="danger">{error}</Alert> : null}
      <div className="flex gap-3">
        <Button type="button" color="neutral" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" color="primary" disabled={state === 'busy'}>
          {state === 'busy' ? 'Submitting…' : 'Submit question'}
        </Button>
      </div>
    </form>
  );
}
