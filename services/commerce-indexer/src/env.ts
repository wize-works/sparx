// Boot-time env validation. Cloud Run Pub/Sub push entrypoint.

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // Expected `email` claim in the Pub/Sub push OIDC token — defense in
  // depth on top of Cloud Run's frontend auth check. Leave unset in dev.
  PUBSUB_INVOKER_SA: z.string().email().optional(),

  // Typesense. Same env shape @sparx/search uses; the package's
  // configFromEnv() reads these directly. We restate them here so the
  // worker fails fast at boot if any are missing.
  TYPESENSE_HOST: z.string().min(1).default('typesense'),
  TYPESENSE_PORT: z.coerce.number().int().min(1).max(65535).default(8108),
  TYPESENSE_PROTOCOL: z.enum(['http', 'https']).default('http'),
  TYPESENSE_API_KEY: z.string().min(1),
  TYPESENSE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(60).default(5),

  // Used by @sparx/commerce's projection for image URL stamping. Either
  // is acceptable; CDN URL takes precedence if both are set.
  SPARX_MEDIA_CDN_URL: z.string().url().optional(),
  GCS_MEDIA_BUCKET: z.string().optional(),
  GCS_MEDIA_PUBLIC_BUCKET: z.string().optional(),

  // When true, the worker creates missing collections in Typesense at
  // boot. Off by default so a misconfigured deploy doesn't accidentally
  // recreate an indexed collection — staff flips this on for first
  // deploy + schema bumps from the dashboard.
  ENSURE_SCHEMAS_ON_BOOT: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[commerce-indexer] invalid environment:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(78); // EX_CONFIG
  }
  return result.data;
}

export const env: Env = parseEnv();
