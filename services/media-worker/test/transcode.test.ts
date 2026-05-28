// Unit test for the transcode pipeline. Pure function so we can feed it
// a real (tiny) PNG and assert variant output without standing up Pub/Sub
// or GCS.

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { transcode } from '../src/transcode.js';

async function makePng(
  width: number,
  height: number,
  rgb: [number, number, number]
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .png()
    .toBuffer();
}

describe('transcode', () => {
  it('produces avif + webp + jpeg variants for a small PNG', async () => {
    const src = await makePng(1600, 1200, [255, 0, 0]);
    const result = await transcode(src, 'image/png');

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.blurhash).toBeTruthy();
    expect(result.dominantColor).toMatch(/^#[0-9a-f]{6}$/);

    // Default widths: [400, 800, 1200, 2000]. 2000 > source, so we get
    // variants for 400 / 800 / 1200 only — i.e. 3 widths × 3 formats = 9.
    expect(result.variants.length).toBe(9);

    const formats = new Set(result.variants.map((v) => v.format));
    expect(formats).toEqual(new Set(['avif', 'webp', 'jpeg']));

    const widths = new Set(result.variants.map((v) => v.width));
    expect(widths).toEqual(new Set([400, 800, 1200]));

    // Each variant body is a non-empty buffer.
    for (const v of result.variants) {
      expect(v.body.length).toBeGreaterThan(0);
    }
  });

  it('skips upscales — 200×200 source yields a single 1:1 set', async () => {
    const src = await makePng(200, 200, [0, 200, 0]);
    const result = await transcode(src, 'image/png');

    // All requested widths exceed source, so we produce one (200) × 3 formats.
    expect(result.variants.map((v) => v.width)).toEqual([200, 200, 200]);
    expect(result.variants.map((v) => v.format).sort()).toEqual(['avif', 'jpeg', 'webp']);
  });

  it('no variants for non-raster mime types', async () => {
    const result = await transcode(Buffer.from('<svg/>'), 'image/svg+xml');
    expect(result.variants).toEqual([]);
    expect(result.blurhash).toBeNull();
    expect(result.dominantColor).toBeNull();
  });
});
