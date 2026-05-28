'use client';

// Drag-drop + click-to-pick upload button.
//
// Flow:
//   1. User picks a file. We POST /v1/media/uploads with metadata; api-rest
//      returns a presigned PUT URL.
//   2. We PUT the bytes to that URL. In prod the URL points at GCS; in dev
//      it points back at api-rest's /v1/media/_local/* handler. Either way
//      the dashboard treats it as opaque.
//   3. We POST /v1/media/uploads/:id/complete to flip the row out of
//      'uploading'. The transcode worker (prod) or /complete itself (dev)
//      transitions to 'ready'.
//
// Errors surface inline; success triggers a router.refresh() so the
// asset list updates without a full reload.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Stack, Text } from '@sparx/ui';
import { Upload } from 'lucide-react';
import { initUpload, completeUpload } from './actions';

interface UploadProgress {
  filename: string;
  percent: number;
  status: 'reserving' | 'uploading' | 'completing' | 'done' | 'error';
  error?: string;
}

export function UploadButton() {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);

  async function uploadFile(file: File) {
    setProgress({ filename: file.name, percent: 0, status: 'reserving' });
    const init = await initUpload({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      byteSize: file.size,
    });
    if (!init.ok) {
      setProgress({ filename: file.name, percent: 0, status: 'error', error: init.error });
      return;
    }
    const data = init.data;
    if (!data) {
      setProgress({
        filename: file.name,
        percent: 0,
        status: 'error',
        error: 'Server returned no upload URL.',
      });
      return;
    }

    setProgress({ filename: file.name, percent: 0, status: 'uploading' });
    try {
      await putWithProgress(data.upload.url, data.upload.headers, file, (loaded) => {
        const percent = Math.min(99, Math.round((loaded / file.size) * 100));
        setProgress({ filename: file.name, percent, status: 'uploading' });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setProgress({ filename: file.name, percent: 0, status: 'error', error: message });
      return;
    }

    setProgress({ filename: file.name, percent: 100, status: 'completing' });
    const complete = await completeUpload(data.asset.id);
    if (!complete.ok) {
      setProgress({ filename: file.name, percent: 100, status: 'error', error: complete.error });
      return;
    }

    setProgress({ filename: file.name, percent: 100, status: 'done' });
    router.refresh();
    // Clear the progress strip after a beat so the next upload starts clean.
    setTimeout(() => setProgress(null), 1500);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void uploadFile(file);
    e.currentTarget.value = '';
  }

  return (
    <Stack gap={2}>
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        onChange={onPick}
        accept="image/*,video/*,audio/*,application/pdf"
        aria-label="Choose file to upload"
      />
      <Button
        variant="module"
        leftIcon={<Upload className="h-4 w-4" />}
        onClick={() => fileRef.current?.click()}
        disabled={progress?.status === 'uploading' || progress?.status === 'reserving'}
        loading={progress?.status === 'uploading' || progress?.status === 'reserving'}
      >
        Upload media
      </Button>
      {progress && progress.status !== 'done' && (
        <Stack gap={1}>
          <Text size="xs" variant={progress.status === 'error' ? 'danger' : 'muted'}>
            {progress.filename}
            {progress.status === 'reserving' && ' — preparing…'}
            {progress.status === 'uploading' && ` — ${progress.percent}%`}
            {progress.status === 'completing' && ' — finalising…'}
            {progress.status === 'error' && ` — ${progress.error ?? 'failed'}`}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}

// Native XHR so we can report progress; fetch() doesn't yet expose upload
// progress events in any stable cross-browser way.
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted.')));
    xhr.send(body);
  });
}
