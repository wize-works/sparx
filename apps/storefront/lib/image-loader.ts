// Custom next/image loader for the storefront.
//
// Storefront images resolve through api-rest's public media endpoint
// (/v1/public/media/<id>), which 302-redirects to the stored GCS object. We
// hand next/image this loader so it builds the responsive srcset URLs with
// w/q params appended (see storefrontImageLoader). The endpoint currently
// ignores those params — every variant resolves to the same object — so the
// immediate win is standardized lazy-loading + layout-stable sizing; the day a
// resizing CDN sits in front of media (a Phase-2 infra upgrade), the same
// srcset starts serving correctly-sized bytes with zero component changes.

import { storefrontImageLoader } from './media';

export default function imageLoader(params: {
  src: string;
  width: number;
  quality?: number;
}): string {
  return storefrontImageLoader(params);
}
