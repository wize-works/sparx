'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Archive, RotateCcw, Send, Undo } from 'lucide-react';

import { Button, Stack } from '@sparx/ui';

import {
  archiveProductAction,
  publishProductAction,
  restoreProductAction,
  unpublishProductAction,
} from '../../../product-actions';

interface Props {
  productId: string;
  status: 'draft' | 'active' | 'archived';
  hasVariants: boolean;
}

// Inline status controls in the page header. Each button hits the matching
// Server Action and refreshes the page on success so the status badge +
// publishedAt rerender immediately without a hard reload.
//
// Publishing a product with zero variants is allowed today but should be
// gated once variantService lands (Phase 1.2) — leaving the affordance
// here keeps the affordance visible and the warning is a deliberate
// product decision tracked in [docs/09-ecommerce-module-prd.md].

export function ProductStatusBar({ productId, status, hasVariants }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function run(
    action: (
      id: string
    ) => Promise<{ ok: true; data: unknown } | { ok: false; error: { message: string } }>
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(productId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={2} align="end">
      <Stack direction="row" gap={2}>
        {status === 'draft' && (
          <Button
            type="button"
            color="module"
            disabled={pending}
            loading={pending}
            leftIcon={<Send className="h-4 w-4" />}
            onClick={() => run(publishProductAction)}
            title={
              hasVariants
                ? 'Publish to the storefront'
                : 'No variants yet — published without a price'
            }
          >
            Publish
          </Button>
        )}
        {status === 'active' && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            loading={pending}
            leftIcon={<Undo className="h-4 w-4" />}
            onClick={() => run(unpublishProductAction)}
          >
            Unpublish
          </Button>
        )}
        {status === 'archived' ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            loading={pending}
            leftIcon={<RotateCcw className="h-4 w-4" />}
            onClick={() => run(restoreProductAction)}
          >
            Restore
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            loading={pending}
            leftIcon={<Archive className="h-4 w-4" />}
            onClick={() => run(archiveProductAction)}
          >
            Archive
          </Button>
        )}
      </Stack>
      {error && (
        <span className="text-xs text-[var(--color-text-danger)]" role="alert" aria-live="polite">
          {error}
        </span>
      )}
    </Stack>
  );
}
