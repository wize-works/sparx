// Media asset URL resolution for the storefront.
//
// The public resolver lives at api-rest:
//   GET /v1/public/media/<id>?tenant=<slug>  → 302 to the stored GCS object
// We point <img>/<Image> straight at it; the redirect is cacheable
// (immutable, 1-year) so the CDN collapses it after first hit.

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

/** Resolve a media asset id → a stable public URL. Returns null for a null
 *  id so callers can fall back to a placeholder. */
export function mediaUrl(assetId: string | null | undefined, tenantSlug: string): string | null {
  if (!assetId) return null;
  return `${BASE_URL}/v1/public/media/${encodeURIComponent(assetId)}?tenant=${encodeURIComponent(
    tenantSlug
  )}`;
}

/**
 * A `next/image` loader bound to the public resolver. The endpoint redirects
 * to the origin object; width/quality are advisory (the CDN/origin may ignore
 * them) but kept in the URL so Next treats variants as distinct cache keys.
 */
export function storefrontImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const sep = src.includes('?') ? '&' : '?';
  return `${src}${sep}w=${width}&q=${quality ?? 75}`;
}
