'use client';

// A brand asset field (logo light/dark, favicon). Unlike the section-editor
// MediaField — which only PICKS from existing assets — a fresh merchant has no
// media yet, so this also UPLOADS: it reuses the shared presigned-URL flow
// (initUpload → browser PUT → completeUpload) and the CMS asset picker, then
// reports the chosen asset id + a preview URL up to the parent. The brand form
// stores the id; the URL is only for the board preview.

import * as React from 'react';
import { Button } from '@sparx/ui';
import { ImageIcon, Upload } from 'lucide-react';
import { MediaPicker } from '../../cms/_components/media-picker';
import { initUpload, completeUpload } from '../../cms/media/actions';
import { resolveBrandMedia } from '../_lib/actions';

export interface BrandImageFieldProps {
  label: string;
  /** Stored asset id, or null. */
  value: string | null;
  /** Resolved preview URL for the current value (may be null while resolving). */
  previewUrl: string | null;
  onChange: (assetId: string | null, previewUrl: string | null) => void;
  help?: string;
  /** Dark chip so a light/white logo is visible in its thumbnail. */
  dark?: boolean;
}

export function BrandImageField({
  label,
  value,
  previewUrl,
  onChange,
  help,
  dark,
}: BrandImageFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const init = await initUpload({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        byteSize: file.size,
      });
      if (!init.ok || !init.data) {
        throw new Error(init.ok ? 'Server returned no upload URL.' : init.error);
      }
      const put = await fetch(init.data.upload.url, {
        method: 'PUT',
        headers: init.data.upload.headers,
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
      const done = await completeUpload(init.data.asset.id);
      if (!done.ok) throw new Error(done.error);
      const url = await resolveBrandMedia(init.data.asset.id);
      onChange(init.data.asset.id, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
      <div className="flex items-center gap-3">
        <div
          className={`flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-default)] ${
            dark ? 'bg-[#0b0b0f]' : 'bg-[var(--color-bg-subtle)]'
          }`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-5 w-5 text-[var(--color-text-tertiary)]" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              loading={busy}
            >
              Upload
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(true)}
              disabled={busy}
            >
              Choose existing
            </Button>
            {value ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(null, null)}
                disabled={busy}
              >
                Remove
              </Button>
            ) : null}
          </div>
          {error ? (
            <span className="text-xs text-[var(--color-danger-text)]">{error}</span>
          ) : help ? (
            <span className="text-xs text-[var(--color-text-muted)]">{help}</span>
          ) : null}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept="image/*"
        onChange={onFile}
        aria-hidden
        tabIndex={-1}
      />
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        accept={['image/*']}
        onPick={(asset) => {
          onChange(asset.assetId, asset.src || null);
          setOpen(false);
        }}
      />
    </div>
  );
}
