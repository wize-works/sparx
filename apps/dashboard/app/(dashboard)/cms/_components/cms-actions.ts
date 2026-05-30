'use server';

// Server Actions that back the CMS client-side pickers (reference-picker,
// media-picker). Replaces the former `/api/internal/cms/*` Next.js route
// handlers — client components call these like normal async functions and
// Next.js handles the transport. The session check + JWT minting happen
// inside `api-rest-client`, so these wrappers stay vanishingly thin.

import { api, type ApiRestError } from '@/lib/api-rest-client';

interface ApiEntryRow {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: Record<string, unknown>;
  updated_at: string;
}

interface ApiMediaAsset {
  id: string;
  original_filename: string;
  mime_type: string;
  alt_text: string | null;
  caption: string | null;
  variants?: { format: string; width: number; url: string }[];
}

export interface SearchEntriesActionParams {
  q?: string;
  typeKey?: string;
  limit?: number;
}

export interface ActionResult<T> {
  success: true;
  data: T;
}
export interface ActionError {
  success: false;
  error: { code: string; message: string };
}

export async function searchEntriesAction(
  params: SearchEntriesActionParams
): Promise<ActionResult<ApiEntryRow[]> | ActionError> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.typeKey) search.set('type', params.typeKey);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  try {
    const data = await api.get<ApiEntryRow[]>(`/v1/content/entries?${search.toString()}`);
    return { success: true, data };
  } catch (err) {
    const e = err as ApiRestError;
    return {
      success: false,
      error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'Request failed' },
    };
  }
}

export interface ListMediaAssetsActionParams {
  q?: string;
  limit?: number;
  cursor?: string;
}

export async function listMediaAssetsAction(
  params: ListMediaAssetsActionParams = {}
): Promise<ActionResult<ApiMediaAsset[]> | ActionError> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  try {
    const data = await api.get<ApiMediaAsset[]>(`/v1/media/assets?${search.toString()}`);
    return { success: true, data };
  } catch (err) {
    const e = err as ApiRestError;
    return {
      success: false,
      error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'Request failed' },
    };
  }
}
