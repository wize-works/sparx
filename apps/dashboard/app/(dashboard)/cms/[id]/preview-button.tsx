'use client';

// "Copy preview URL" — mints a fresh preview token via the server action
// and writes a copy-able URL to the clipboard. The URL points at the
// marketing site (apps/web at NEXT_PUBLIC_MARKETING_URL) with the token
// in the `?sparxPreview=` query — apps/web reads that and switches its
// CMS fetcher to the draft-allowed code path.
//
// Falls back to a temporary text box if the Clipboard API isn't
// available (older browsers, non-secure contexts in dev) so the editor
// can still grab the URL by selecting + copying manually.

import * as React from 'react';
import { Button, Stack, Text } from '@sparx/ui';
import { Eye } from 'lucide-react';
import { mintPreviewUrl } from '../actions';

const STOREFRONT_ORIGIN = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://sparx.works';

export function PreviewButton({
  entryId,
  slug,
  typeKey,
}: {
  entryId: string;
  slug: string;
  typeKey: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [copied, setCopied] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function onClick() {
    setError(null);
    setCopied(null);
    startTransition(async () => {
      const result = await mintPreviewUrl(entryId);
      if (!result.ok || !result.data) {
        setError(result.error ?? 'Could not mint a preview URL.');
        return;
      }
      // Marketing-tenant module pages live at `/<slug>` (e.g. /cms,
      // /commerce). When the type isn't 'module' we fall back to a path
      // shape that matches the canonical sitemap so future storefronts
      // resolve correctly — `/blog/<slug>` for blog_post etc.
      const path = pathFor(typeKey, slug);
      const url = `${STOREFRONT_ORIGIN}${path}?sparxPreview=${encodeURIComponent(result.data.token)}`;

      try {
        await navigator.clipboard.writeText(url);
        setCopied(url);
      } catch {
        // Fallback: surface the URL inline so the editor can copy by hand.
        setCopied(url);
      }
    });
  }

  return (
    <Stack gap={1}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        leftIcon={<Eye className="h-3.5 w-3.5" />}
        onClick={onClick}
        disabled={pending}
        loading={pending}
      >
        Preview link
      </Button>
      {copied && (
        <Text size="xs" variant="muted" aria-live="polite">
          Copied: <span className="break-all">{copied}</span>
        </Text>
      )}
      {error && (
        <Text size="xs" variant="danger" aria-live="polite">
          {error}
        </Text>
      )}
    </Stack>
  );
}

function pathFor(typeKey: string, slug: string): string {
  if (typeKey === 'module') return `/${slug}`;
  if (typeKey === 'blog_post') return `/blog/${slug}`;
  return `/${slug}`;
}
