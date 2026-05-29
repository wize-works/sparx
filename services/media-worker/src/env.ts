// Boot-time env validation. Cloud Run entrypoint (Pub/Sub push), so we no
// longer need GCP_PROJECT_ID / PUBSUB_SUBSCRIPTION / MAX_CONCURRENT — those
// were pull-loop concerns. Concurrency is now controlled by Cloud Run's
// containerConcurrency (TF-managed).

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  // Cloud Run injects PORT (default 8080). Honoured here so the listener
  // matches what the platform expects.
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // Expected `email` claim in the Pub/Sub push OIDC token — defense in
  // depth on top of Cloud Run's frontend auth check. Leave unset in dev.
  PUBSUB_INVOKER_SA: z.string().email().optional(),
  // Cloud Storage — must be set, the worker has no local-disk fallback.
  // Originals are read from the private bucket; variants are written to
  // the public bucket (world-readable behind CDN). Both names come from
  // terraform/modules/storage. In dev you can set them to the same value.
  GCS_MEDIA_BUCKET: z.string().min(1),
  GCS_MEDIA_PUBLIC_BUCKET: z
    .string()
    .min(1)
    .optional()
    .transform((v) => v ?? process.env.GCS_MEDIA_BUCKET ?? ''),
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
