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
import { Button, Stack, Text, toast } from '@sparx/ui';
import { Check, Eye } from 'lucide-react';
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
  const [recentlyCopied, setRecentlyCopied] = React.useState(false);
  // Fallback URL surfaced inline only when the Clipboard API throws — the
  // editor can then select-and-copy by hand. Toast handles the happy path
  // so the URL doesn't persistently clutter the action row (UX-8).
  const [manualCopyUrl, setManualCopyUrl] = React.useState<string | null>(null);

  function onClick() {
    setManualCopyUrl(null);
    startTransition(async () => {
      const result = await mintPreviewUrl(entryId);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? 'Could not mint a preview URL.');
        return;
      }
      const origin = originFor(tenantSlug);
      const path = pathFor(typeKey, slug);
      const url = `${origin}${path}?sparxPreview=${encodeURIComponent(result.data.token)}`;

      try {
        await navigator.clipboard.writeText(url);
        toast.success('Preview link copied to clipboard');
        setRecentlyCopied(true);
        // Brief check-icon flash so power users get visual confirmation
        // even with toast suppressed. Reset after a beat.
        setTimeout(() => setRecentlyCopied(false), 2000);
      } catch {
        // Clipboard API blocked (insecure context, no permission). Surface
        // the URL inline so the editor can copy by hand — single-shot, the
        // next click clears it.
        setManualCopyUrl(url);
        toast.error('Clipboard blocked — copy the URL below manually.');
      }
    });
  }

  return (
    <Stack gap={1}>
      <Button
        type="button"
        variant={recentlyCopied ? 'module-outline' : 'ghost'}
        size="sm"
        leftIcon={
          recentlyCopied ? <Check className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />
        }
        onClick={onClick}
        disabled={pending}
        loading={pending}
        aria-label={recentlyCopied ? 'Preview link copied' : 'Copy preview link'}
      >
        {recentlyCopied ? 'Copied' : 'Preview link'}
      </Button>
      {manualCopyUrl && (
        <Text size="xs" variant="muted" aria-live="polite">
          <code className="break-all">{manualCopyUrl}</code>
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
