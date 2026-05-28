'use server';

// Server actions for the media library. Mirror the existing /cms actions.ts
// shape: each action returns `{ ok, error?, data? }` so the client UI can
// surface a typed error without re-throwing.
//
// All bytes go through the api-rest presigned-URL flow. Even in LocalStorage
// mode the dashboard talks to api-rest's /v1/media/_local/* endpoint — never
// to the filesystem directly — so the auth + audit + RLS path is honest.

import { revalidatePath } from 'next/cache';
import { api, type ApiRestError } from '@/lib/api-rest-client';

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

interface UploadInit {
  asset: { id: string; key: string; status: string };
  upload: {
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    expires_at: string;
  };
}

export async function initUpload(input: {
  filename: string;
  mimeType: string;
  byteSize: number;
}): Promise<ActionResult<UploadInit>> {
  try {
    const data = await api.post<UploadInit>('/v1/media/uploads', {
      filename: input.filename,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function completeUpload(assetId: string): Promise<ActionResult> {
  try {
    await api.post(`/v1/media/uploads/${assetId}/complete`);
    revalidatePath('/cms/media');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function patchAsset(
  assetId: string,
  payload: {
    alt_text?: string | null;
    caption?: string | null;
    focal_point_x?: number;
    focal_point_y?: number;
  }
): Promise<ActionResult> {
  try {
    await api.patch(`/v1/media/assets/${assetId}`, payload);
    revalidatePath('/cms/media');
    revalidatePath(`/cms/media/${assetId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function deleteAsset(assetId: string): Promise<ActionResult> {
  try {
    await api.delete(`/v1/media/assets/${assetId}`);
    revalidatePath('/cms/media');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

function messageFor(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return (err as ApiRestError).message;
  }
  return 'Something went wrong.';
}
