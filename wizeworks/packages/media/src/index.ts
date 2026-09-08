// @wizeworks/media — media asset service + focused storage for headless callers.
// The MCP tools live under the `./mcp` subpath (import from '@wizeworks/media/mcp')
// so a caller that only needs the service/storage doesn't pull the tool layer.

export {
  countAssetUsage,
  countOneAssetUsage,
  describeUsage,
  UNCOUNTED,
  type AssetUsage,
} from './asset-usage.js';

export {
  ALLOWED_IMAGE_MIME,
  ALLOWED_DOCUMENT_MIME,
  MAX_UPLOAD_IMAGE_BYTES,
  MAX_UPLOAD_DOCUMENT_BYTES,
  MAX_PROXIED_UPLOAD_BYTES,
  MediaValidationError,
  createImageAssetFromBytes,
  createDocumentAssetFromBytes,
  createImageAssetFromUrl,
  createImageUpload,
  deleteMediaAsset,
  resolveMediaUrl,
  type MediaWriteContext,
  type CreatedImage,
  type CreatedDocument,
  type UploadImageBytesInput,
  type UploadDocumentBytesInput,
  type ImageFromUrlInput,
  type CreateImageUploadInput,
  type ImageUpload,
  type DeletedImage,
} from './asset-service.js';
export { getStorage, originalKey, safeFilename, type MediaStorage } from './storage.js';
export { storageEnv, type StorageEnv } from './env.js';
export {
  mintUploadToken,
  verifyUploadToken,
  type UploadTokenClaims,
  type UploadTokenResult,
} from './upload-token.js';
