'use client';

import * as React from 'react';
import { Badge, Button, Heading, Input, Label, Stack, Text, Textarea } from '@sparx/ui';
import { createFirstProductAction } from '../_lib/actions';
import type { StepNav } from './onboarding-wizard';

export function StepProduct({ nav }: { nav: StepNav }) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createFirstProductAction({ title, description });
      if (res.ok) nav.onNext();
      else setError(res.error);
    });
  }

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Heading level={3}>Add your first product</Heading>
        <Text variant="muted">
          Just a title to start — it publishes live. Add pricing, variants, media, and fitment from
          the product page afterwards.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Label htmlFor="ob-product-title">Product title</Label>
        <Input
          id="ob-product-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Premium diesel injector, 6.7L"
        />
      </Stack>

      <Stack gap={2}>
        <Label htmlFor="ob-product-desc">Description (optional)</Label>
        <Textarea
          id="ob-product-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="A short description shoppers will see on the product page."
        />
      </Stack>

      <div className="rounded-lg border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4">
        <Stack direction="row" align="center" justify="between" gap={3}>
          <Stack gap={1}>
            <Stack direction="row" align="center" gap={2}>
              <Text weight="medium">Import from a dropship supplier</Text>
              <Badge variant="outline">Coming soon</Badge>
            </Stack>
            <Text size="sm" variant="muted">
              Bulk-import a catalog from a connected supplier instead of adding products by hand.
            </Text>
          </Stack>
          <Button variant="outline" disabled>
            Connect
          </Button>
        </Stack>
      </div>

      {error && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {error}
        </Text>
      )}

      <Stack direction="row" justify="between">
        <Button variant="ghost" onClick={nav.onBack} disabled={pending || nav.navPending}>
          Back
        </Button>
        <Stack direction="row" gap={2}>
          <Button variant="ghost" onClick={nav.onSkip} disabled={pending || nav.navPending}>
            Skip for now
          </Button>
          <Button
            color="module"
            onClick={onCreate}
            disabled={pending || !title.trim()}
            loading={pending}
          >
            Add product
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
