'use client';

// Asset picker modal.
//
// Lazy-loads `/v1/media/assets` and surfaces a grid; the user picks one and
// the parent receives `{ src, alt, caption, assetId }`. Used by both the
// rich-text editor (Insert image button) and the schema-driven form's
// `asset` field type.
//
// Search is debounced client-side over the in-memory list. For tenants
// with thousands of assets we'll add a server-side query — that's a Phase
// 2 follow-up flagged in the comment below.

import * as React from 'react';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Stack,
  Text,
} from '@sparx/ui';
import { ImageIcon, Search } from 'lucide-react';

import { listMediaAssetsAction } from './cms-actions';

export interface PickedAsset {
  src: string;
  alt: string;
  caption?: string;
  assetId: string;
}

interface ApiAsset {
  id: string;
  original_filename: string;
  mime_type: string;
  alt_text: string | null;
  caption: string | null;
  variants?: { format: string; width: number; url: string }[];
}

export interface MediaPickerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onPick: (asset: PickedAsset) => void;
  /** Filter by mime pattern, e.g. ['image/*']. */
  accept?: string[];
}

function pickBestVariant(asset: ApiAsset): string | null {
  if (!asset.variants?.length) return null;
  // Prefer webp around 800w as a thumbnail; fall back to the smallest variant.
  const webp = asset.variants
    .filter((v) => v.format === 'webp')
    .sort((a, b) => Math.abs(a.width - 800) - Math.abs(b.width - 800));
  if (webp[0]) return webp[0].url;
  return asset.variants[0]?.url ?? null;
}

function matchesAccept(mime: string, accept: string[] | undefined): boolean {
  if (!accept?.length) return true;
  return accept.some((pat) => {
    if (pat === '*' || pat === '*/*') return true;
    if (pat.endsWith('/*')) return mime.startsWith(pat.slice(0, -1));
    return mime === pat;
  });
}

export function MediaPicker({ open, onOpenChange, onPick, accept }: MediaPickerProps) {
  const [loading, setLoading] = React.useState(false);
  const [assets, setAssets] = React.useState<ApiAsset[]>([]);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMediaAssetsAction({ limit: 120 })
      .then((body) => {
        if (cancelled) return;
        if (body.success) {
          setAssets(body.data);
        } else {
          setError(body.error.message ?? 'Failed to load assets.');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load assets.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assets.filter((a) => {
      if (!matchesAccept(a.mime_type, accept)) return false;
      if (!needle) return true;
      return (
        a.original_filename.toLowerCase().includes(needle) ||
        (a.alt_text ?? '').toLowerCase().includes(needle)
      );
    });
  }, [assets, q, accept]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-3xl">
        <ModalHeader>
          <ModalTitle>Select an asset</ModalTitle>
        </ModalHeader>
        <div className="px-6 py-2">
          <Stack gap={3}>
            <Stack direction="row" align="center" gap={2}>
              <Search className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <Input
                placeholder="Filter by filename or alt text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Filter assets"
              />
            </Stack>
            {loading && <Text variant="muted">Loading assets…</Text>}
            {error && <Text variant="danger">{error}</Text>}
            {!loading && !error && filtered.length === 0 && (
              <Text variant="muted">No assets matched.</Text>
            )}
            <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((a) => {
                const thumb = pickBestVariant(a);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      onPick({
                        src: thumb ?? '',
                        alt: a.alt_text ?? '',
                        caption: a.caption ?? undefined,
                        assetId: a.id,
                      })
                    }
                    className="group relative aspect-square overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none"
                    aria-label={`Pick ${a.original_filename}`}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={a.alt_text ?? a.original_filename}
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-[var(--color-text-tertiary)]" />
                      </div>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[10px] text-white">
                      {a.original_filename}
                    </span>
                  </button>
                );
              })}
            </div>
          </Stack>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
