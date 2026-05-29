'use client';

// "Copy preview URL" — mints a fresh preview token via the server action
// and writes a copy-able URL to the clipboard. The URL points at the
// tenant's storefront on <slug>.sparx.zone (or the platform marketing site
// for the marketing tenant itself) with the token in the `?sparxPreview=`
// query — apps/storefront and apps/web read that and switch their CMS
// fetcher to the draft-allowed code path.
//
// Falls back to a temporary text box if the Clipboard API isn't
// available (older browsers, non-secure contexts in dev) so the editor
// can still grab the URL by selecting + copying manually.

import * as React from 'react';
import { Button, Stack, Text } from '@sparx/ui';
import { Eye } from 'lucide-react';
import { mintPreviewUrl } from '../actions';

const ZONE_DOMAIN = process.env.NEXT_PUBLIC_SPARX_ZONE_DOMAIN ?? 'sparx.zone';
const FALLBACK_ORIGIN = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://sparx.works';

function originFor(tenantSlug: string | null): string {
  // Tenant storefronts live at <slug>.sparx.zone. Without a slug we point
  // at the platform marketing site so the marketing-tenant module pages
  // (which apps/web does serve) still get a working preview link.
  if (tenantSlug && tenantSlug !== 'sparx-marketing') {
    return `https://${tenantSlug}.${ZONE_DOMAIN}`;
  }
  return FALLBACK_ORIGIN;
}

export function PreviewButton({
  entryId,
  slug,
  typeKey,
  tenantSlug,
}: {
  entryId: string;
  slug: string;
  typeKey: string;
  tenantSlug: string | null;
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
      const origin = originFor(tenantSlug);
      const path = pathFor(typeKey, slug);
      const url = `${origin}${path}?sparxPreview=${encodeURIComponent(result.data.token)}`;

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
  // Marketing-tenant module pages live at `/<slug>` (e.g. /cms, /commerce).
  // Tenant storefronts also serve pages at `/<slug>` but with `home` for
  // the root; blog_post entries get `/blog/<slug>`. Other types fall
  // through to `/<slug>` so they at least hit the catch-all route.
  if (typeKey === 'module') return `/${slug}`;
  if (typeKey === 'blog_post') return `/blog/${slug}`;
  if (typeKey === 'page' && slug === 'home') return '/';
  return `/${slug}`;
}
