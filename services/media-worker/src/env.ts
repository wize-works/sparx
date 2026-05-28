// Boot-time env validation. Same pattern as services/api-rest/src/env.ts:
// a missing var fails the process with a readable error before we open
// the Pub/Sub subscription.

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  // Pub/Sub. The worker pulls from a tenant-agnostic subscription that
  // filters on `attributes.type='media.uploaded'`.
  GCP_PROJECT_ID: z.string().min(1),
  PUBSUB_SUBSCRIPTION: z.string().default('media-worker'),
  // Cloud Storage — must be set, the worker has no local-disk fallback.
  GCS_MEDIA_BUCKET: z.string().min(1),
  // Variant widths (px). Smaller than 400 isn't worth a network round-trip;
  // larger than 2000 hits CDN cache pressure without quality gains.
  VARIANT_WIDTHS: z
    .string()
    .default('400,800,1200,2000')
    .transform((s) =>
      s
        .split(',')
        .map((w) => Number(w.trim()))
        .filter((w) => w > 0)
    ),
  // sharp JPEG quality (1-100). 82 is the standard "good enough" for web.
  JPEG_QUALITY: z.coerce.number().int().min(1).max(100).default(82),
  WEBP_QUALITY: z.coerce.number().int().min(1).max(100).default(80),
  AVIF_QUALITY: z.coerce.number().int().min(1).max(100).default(60),
  // How many uploaded assets to process in parallel. Sharp is CPU-heavy;
  // 2 keeps a 2-vCPU pod busy without thrashing.
  MAX_CONCURRENT: z.coerce.number().int().min(1).max(16).default(2),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[media-worker] invalid environment:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(78); // EX_CONFIG
  }
  return result.data;
}

export const env: Env = parseEnv();
