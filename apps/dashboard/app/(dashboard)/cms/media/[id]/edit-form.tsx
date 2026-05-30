'use client';

// Asset detail form: focal-point editor + alt-text + caption + destructive
// delete. Optimistic local state mirrors the existing /cms edit form so
// the UX stays consistent: save commits via a server action; pending UI
// blocks the buttons rather than rolling back on failure.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, Stack, Text, Textarea, useConfirm } from '@sparx/ui';
import { Trash2 } from 'lucide-react';
import { deleteAsset, patchAsset } from '../actions';

export interface AssetEditFormProps {
  assetId: string;
  isImage: boolean;
  previewUrl: string | null;
  altText: string | null;
  caption: string | null;
  focalPoint: { x: number; y: number };
}

export function AssetEditForm({
  assetId,
  isImage,
  previewUrl,
  altText: initialAltText,
  caption: initialCaption,
  focalPoint: initialFocalPoint,
}: AssetEditFormProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [altText, setAltText] = React.useState(initialAltText ?? '');
  const [caption, setCaption] = React.useState(initialCaption ?? '');
  const [focal, setFocal] = React.useState(initialFocalPoint);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  function onFocalClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isImage || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const next = { x: round(x), y: round(y) };
    setFocal(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await patchAsset(assetId, {
        alt_text: altText || null,
        caption: caption || null,
        focal_point_x: focal.x,
        focal_point_y: focal.y,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage('Saved.');
      router.refresh();
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete this asset?',
      description: 'This cannot be undone — the file and every reference to it are removed.',
      confirmLabel: 'Delete asset',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteAsset(assetId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/cms/media');
      router.refresh();
    });
  }

  return (
    <Stack gap={4}>
      {isImage && previewUrl ? (
        <div
          ref={containerRef}
          role="button"
          tabIndex={0}
          aria-label="Click to set focal point"
          onClick={onFocalClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFocal({ x: 0.5, y: 0.5 });
            }
          }}
          className="relative w-full cursor-crosshair overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]"
          style={{ aspectRatio: '16 / 9' }}
        >
          <img
            src={previewUrl}
            alt={altText || 'Asset preview'}
            className="h-full w-full object-contain"
            draggable={false}
          />
          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
            style={{
              left: `${focal.x * 100}%`,
              top: `${focal.y * 100}%`,
              backgroundColor: 'var(--module-active)',
            }}
            aria-hidden
          />
        </div>
      ) : (
        <Text size="sm" variant="muted">
          {previewUrl ? 'Preview not available for this file type.' : 'No preview available.'}
        </Text>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Stack gap={4}>
          <Stack gap={2}>
            <Label htmlFor="alt-text">Alt text</Label>
            <Input
              id="alt-text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              maxLength={500}
              placeholder="Describe the image for screen readers and SEO."
            />
          </Stack>

          <Stack gap={2}>
            <Label htmlFor="caption">Caption (optional)</Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </Stack>

          {isImage && (
            <Text size="xs" variant="muted">
              Focal point: ({focal.x.toFixed(2)}, {focal.y.toFixed(2)})
            </Text>
          )}

          {error && (
            <Text size="sm" variant="danger" role="alert" aria-live="polite">
              {error}
            </Text>
          )}
          {message && (
            <Text size="sm" variant="success" aria-live="polite">
              {message}
            </Text>
          )}

          <Stack direction="row" gap={2}>
            <Button type="submit" variant="module" disabled={pending} loading={pending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="ghost"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => void onDelete()}
              disabled={pending}
            >
              Delete
            </Button>
          </Stack>
        </Stack>
      </form>
    </Stack>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
