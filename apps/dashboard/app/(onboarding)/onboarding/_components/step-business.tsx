'use client';

import * as React from 'react';
import { Button, Heading, Input, Label, Stack, Text } from '@sparx/ui';
import { saveBusinessAction } from '../_lib/actions';
import type { StepNav } from './onboarding-wizard';

// A small, opinionated category list. It's stored on the tenant's onboarding
// state and used as a soft signal for theme recommendations — not a hard
// taxonomy, so "Other" is always fine.
const CATEGORIES = [
  { value: 'auto-industrial', label: 'Auto & industrial' },
  { value: 'apparel', label: 'Apparel & accessories' },
  { value: 'food-beverage', label: 'Food & beverage' },
  { value: 'home-goods', label: 'Home & goods' },
  { value: 'health-beauty', label: 'Health & beauty' },
  { value: 'digital-services', label: 'Digital & services' },
  { value: 'other', label: 'Other' },
];

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none';

export function StepBusiness({
  initialName,
  initialCategory,
  nav,
}: {
  initialName: string;
  initialCategory: string | null;
  nav: StepNav;
}) {
  const [name, setName] = React.useState(initialName);
  const [category, setCategory] = React.useState(initialCategory ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onContinue() {
    setError(null);
    startTransition(async () => {
      const res = await saveBusinessAction({ name, category: category || null });
      if (res.ok) nav.onNext();
      else setError(res.error);
    });
  }

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Heading level={3}>Tell us about your business</Heading>
        <Text variant="muted">
          We&apos;ll turn on your storefront and commerce so the next steps are ready to go.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Label htmlFor="ob-name">Store name</Label>
        <Input
          id="ob-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Diesel"
          autoComplete="organization"
        />
      </Stack>

      <Stack gap={2}>
        <Label htmlFor="ob-category">What do you sell?</Label>
        <select
          id="ob-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Choose a category…</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <Text size="xs" variant="muted">
          Helps us suggest a theme. You can pick any theme regardless.
        </Text>
      </Stack>

      {error && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {error}
        </Text>
      )}

      <Stack direction="row" justify="end">
        <Button
          variant="module"
          onClick={onContinue}
          disabled={pending || !name.trim()}
          loading={pending}
        >
          Continue
        </Button>
      </Stack>
    </Stack>
  );
}
