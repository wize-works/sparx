'use client';

// Reusable live-storefront preview iframe for the page builders. Renders the
// tenant's storefront in draft mode (?sparxPreview=1) with device-width toggles.
// Section composition is a STRUCTURAL change (unlike the customizer's token
// edits, which stream over postMessage), so there's no live-patch channel here —
// the parent bumps `refreshKey` after each mutation and the iframe reloads to
// pull the updated draft. A manual Refresh and Open-in-new-tab are provided too.

import * as React from 'react';
import { Button } from '@sparx/ui';
import { ExternalLink, RefreshCw } from 'lucide-react';

const DEVICES: { id: string; label: string; width: number | null }[] = [
  { id: 'desktop', label: 'Desktop', width: null },
  { id: 'tablet', label: 'Tablet', width: 820 },
  { id: 'mobile', label: 'Mobile', width: 390 },
];

export interface PreviewFrameProps {
  storefrontUrl: string;
  slug: string;
  /** Storefront path to preview, e.g. "/" for the homepage or "/about". */
  path?: string;
  /** Bump to force a reload after a structural draft change. */
  refreshKey?: number;
}

export function PreviewFrame({
  storefrontUrl,
  slug,
  path = '/',
  refreshKey = 0,
}: PreviewFrameProps) {
  const [device, setDevice] = React.useState('desktop');
  const [manualNonce, setManualNonce] = React.useState(0);
  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? null;

  // Cache-buster that changes on every parent refresh or manual click. Setting
  // a fresh src/key remounts the iframe — a cross-origin contentWindow.reload()
  // would throw, so we reload by changing the URL instead.
  const nonce = refreshKey + manualNonce;
  const query = `tenant=${encodeURIComponent(slug)}&sparxPreview=1`;
  const src = `${storefrontUrl}${path}?${query}&v=${nonce}`;
  const openUrl = `${storefrontUrl}${path}?${query}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {DEVICES.map((d) => (
            <Button
              key={d.id}
              size="sm"
              variant={device === d.id ? 'primary' : 'ghost'}
              onClick={() => setDevice(d.id)}
            >
              {d.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => setManualNonce((n) => n + 1)}
          >
            Refresh
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
          >
            <a href={openUrl} target="_blank" rel="noreferrer">
              Open
            </a>
          </Button>
        </div>
      </div>

      <div className="flex justify-center overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3">
        <iframe
          key={nonce}
          title="Storefront preview"
          src={src}
          className="h-[calc(100vh-280px)] w-full rounded-md border-0 bg-white"
          style={deviceWidth ? { width: deviceWidth, maxWidth: '100%' } : undefined}
        />
      </div>
    </div>
  );
}
