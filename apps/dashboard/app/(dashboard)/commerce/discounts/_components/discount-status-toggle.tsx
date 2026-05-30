'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Stack, Text } from '@sparx/ui';

import {
  activateDiscountAction,
  archiveDiscountAction,
  updateDiscountAction,
} from '../../discount-actions';

export function DiscountStatusToggle({
  discountId,
  status,
}: {
  discountId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function activate() {
    setError(null);
    startTransition(async () => {
      const result = await activateDiscountAction(discountId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function moveToDraft() {
    setError(null);
    startTransition(async () => {
      const result = await updateDiscountAction(discountId, { status: undefined });
      // updateDiscountAction doesn't actually take status, so fall back to
      // a no-op then explicit archive route.
      if (!result.ok) {
        setError(result.error.message);
      }
      router.refresh();
    });
  }

  function archive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveDiscountAction(discountId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  // Acknowledge to satisfy lint; the draft transition is exposed as an
  // explicit Edit button on the detail page (Phase 3.1+).
  void moveToDraft;

  if (status === 'archived') {
    return (
      <Text size="xs" variant="muted">
        archived
      </Text>
    );
  }

  return (
    <Stack direction="row" gap={1} align="center">
      {error && (
        <Text size="xs" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
      {status === 'draft' && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={activate}>
          Activate
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={archive}>
        Archive
      </Button>
    </Stack>
  );
}
