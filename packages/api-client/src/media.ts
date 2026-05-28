// Media surface — upload presign, complete, asset CRUD.

import type { SparxClient } from './client.js';
import type { MediaAsset } from './types.js';

export interface InitUploadInput {
  filename: string;
  mimeType: string;
  byteSize: number;
}

export interface PresignedUpload {
  asset: MediaAsset;
  upload: {
    url: string;
    headers: Record<string, string>;
    key: string;
    expiresAt: string;
  };
}

export interface UpdateMediaAssetInput {
  altText?: string | null;
  caption?: string | null;
  focalPointX?: number | null;
  focalPointY?: number | null;
}

export class MediaApi {
  constructor(private readonly client: SparxClient) {}

  initUpload(input: InitUploadInput, opts: { idempotencyKey?: string } = {}) {
    return this.client.request<PresignedUpload>({
      method: 'POST',
      path: '/v1/media/uploads',
      body: input,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  completeUpload(assetId: string) {
    return this.client.request<MediaAsset>({
      method: 'POST',
      path: `/v1/media/uploads/${assetId}/complete`,
    });
  }

  listAssets(query: { q?: string; cursor?: string; limit?: number } = {}) {
    return this.client.request<MediaAsset[]>({
      path: '/v1/media/assets',
      query: { q: query.q, cursor: query.cursor, limit: query.limit },
    });
  }

  getAsset(id: string) {
    return this.client.request<MediaAsset>({ path: `/v1/media/assets/${id}` });
  }

  patchAsset(id: string, input: UpdateMediaAssetInput) {
    return this.client.request<MediaAsset>({
      method: 'PATCH',
      path: `/v1/media/assets/${id}`,
      body: input,
    });
  }

  deleteAsset(id: string) {
    return this.client.request<undefined>({
      method: 'DELETE',
      path: `/v1/media/assets/${id}`,
    });
  }
}
