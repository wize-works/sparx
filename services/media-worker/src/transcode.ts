// Variant generation pipeline. Given the raw bytes of an uploaded asset,
// produces one Variant per (format, width) combination + the metadata the
// dashboard needs (blurhash, dominant color, intrinsic dimensions).
//
// Skipped for non-image inputs (video, audio, pdf): we still record the
// original dimensions when sharp can decode them, but don't generate
// derived formats — video transcoding is out of scope for Phase 3.

import sharp from 'sharp';
import { encode as blurhashEncode } from 'blurhash';
import { env } from './env.js';

export interface VariantOutput {
  format: 'avif' | 'webp' | 'jpeg';
  width: number;
  height: number;
  ext: 'avif' | 'webp' | 'jpg';
  contentType: string;
  body: Buffer;
}

export interface TranscodeResult {
  // Source dimensions — recorded on MediaAsset even when no variants
  // were produced (e.g. SVG / video).
  width: number | null;
  height: number | null;
  // 4-char hex like '#aabbcc' derived from the smallest variant. Null
  // when the input wasn't a raster image sharp could decode.
  dominantColor: string | null;
  // BlurHash placeholder — null for non-images.
  blurhash: string | null;
  variants: VariantOutput[];
}

const RASTER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

export async function transcode(input: Buffer, mimeType: string): Promise<TranscodeResult> {
  if (!RASTER_MIME.has(mimeType)) {
    // SVG and non-image types get the no-op treatment — dashboard renders
    // the original via the public URL with no variants.
    return { width: null, height: null, dominantColor: null, blurhash: null, variants: [] };
  }

  const source = sharp(input, { animated: false }).rotate(); // EXIF auto-orient
  const meta = await source.metadata();
  const srcWidth = meta.width ?? null;
  const srcHeight = meta.height ?? null;

  // Skip widths larger than the source — upscaling produces zero quality
  // and wastes CDN bytes.
  const widths = env.VARIANT_WIDTHS.filter((w) => (srcWidth ? w <= srcWidth : true)).sort(
    (a, b) => a - b
  );
  // If the source is smaller than every configured width, still produce
  // a single 1:1 variant in each format so the dashboard has *something*
  // to render. (Avoids the "uploaded a 200×200 logo, got no variants"
  // surprise.)
  const effectiveWidths = widths.length > 0 ? widths : srcWidth ? [srcWidth] : [];

  const variants: VariantOutput[] = [];

  for (const width of effectiveWidths) {
    // Sharp pipeline forks: one resize, three encode passes. Each format
    // gets a fresh clone so we don't carry side-effects between encoders.
    const resized = source.clone().resize({
      width,
      withoutEnlargement: true,
      fit: 'inside',
    });

    const [avif, webp, jpeg] = await Promise.all([
      resized
        .clone()
        .avif({ quality: env.AVIF_QUALITY, effort: 4 })
        .toBuffer({ resolveWithObject: true }),
      resized.clone().webp({ quality: env.WEBP_QUALITY }).toBuffer({ resolveWithObject: true }),
      resized
        .clone()
        .jpeg({ quality: env.JPEG_QUALITY, mozjpeg: true })
        .toBuffer({ resolveWithObject: true }),
    ]);

    variants.push(
      {
        format: 'avif',
        width: avif.info.width,
        height: avif.info.height,
        ext: 'avif',
        contentType: 'image/avif',
        body: avif.data,
      },
      {
        format: 'webp',
        width: webp.info.width,
        height: webp.info.height,
        ext: 'webp',
        contentType: 'image/webp',
        body: webp.data,
      },
      {
        format: 'jpeg',
        width: jpeg.info.width,
        height: jpeg.info.height,
        ext: 'jpg',
        contentType: 'image/jpeg',
        body: jpeg.data,
      }
    );
  }

  // BlurHash + dominant color from a tiny 32×32 thumb so we don't pay
  // sharp's full-image cost twice.
  let blurhash: string | null = null;
  let dominantColor: string | null = null;
  try {
    const thumb = await source
      .clone()
      .resize({ width: 32, height: 32, fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    blurhash = blurhashEncode(
      new Uint8ClampedArray(thumb.data),
      thumb.info.width,
      thumb.info.height,
      4,
      4
    );
    const stats = await source.clone().stats();
    const r = Math.round(stats.channels[0]?.mean ?? 0);
    const g = Math.round(stats.channels[1]?.mean ?? 0);
    const b = Math.round(stats.channels[2]?.mean ?? 0);
    dominantColor = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    // sharp couldn't decode (corrupt or unusual encoding) — fine, we still
    // ship the variants we already produced. Dashboard handles null
    // blurhash / dominantColor gracefully.
  }

  return {
    width: srcWidth,
    height: srcHeight,
    dominantColor,
    blurhash,
    variants,
  };
}
