'use client';

// The one code box on the basket.
//
// A shopper is holding a code. She does not know whether the shop filed it as a
// discount or as a gift card, and there is no reason she should — so this box
// takes either and the server works it out. It used to say "Discount code", and
// a live gift card typed into it came back "No active discount for code …",
// which is where the whole gift-card feature stopped.
//
// The confirmation names what happened, because "$150.00 came off" and "10% came
// off" are different facts and a total alone cannot tell them apart.

import { useState } from 'react';

import { Button, Input } from '@wizeworks/silicaui-react';

import { useCart } from './cart-provider';

export function CodeField() {
  const { applyCode } = useCart();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<'discount' | 'gift_card' | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setApplied(null);
    const result = await applyCode(code.trim());
    setBusy(false);
    if (result.ok) {
      setCode('');
      setApplied(result.kind ?? 'discount');
    } else {
      setError(result.error ?? 'That code can’t be applied.');
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          className="flex-1"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setApplied(null);
          }}
          placeholder="Discount or gift card code"
          aria-label="Discount or gift card code"
        />
        <Button type="submit" variant="outline" disabled={busy || !code.trim()}>
          {busy ? 'Applying…' : 'Apply'}
        </Button>
      </div>
      {error ? <span className="text-danger text-sm">{error}</span> : null}
      {applied === 'gift_card' ? (
        <span className="text-success text-sm">Gift card applied to this order.</span>
      ) : null}
    </form>
  );
}
