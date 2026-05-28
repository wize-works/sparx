// Boot-time env validation. Same shape as services/media-worker/src/env.ts.
//
// Postal is optional in Phase 1: an unset POSTAL_API_KEY selects the
// ConsoleTransport so the worker is exercisable end-to-end before Postal
// is deployed. Once POSTAL_API_KEY is present, the PostalTransport takes
// over automatically on next pod restart — no code change required.

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  // Pub/Sub. Subscription name matches the TF-managed subscription
  // `email.send.email-worker` (terraform/envs/prod/main.tf).
  GCP_PROJECT_ID: z.string().min(1),
  PUBSUB_SUBSCRIPTION: z.string().default('email.send.email-worker'),
  // Maximum in-flight messages. Email rendering is cheap (MJML compiled
  // once at boot, Handlebars interpolation only) so we can pull more than
  // media-worker.
  MAX_CONCURRENT: z.coerce.number().int().min(1).max(64).default(8),
  // Default From address. Per-message `from` overrides this when set.
  EMAIL_FROM: z.string().default('Sparx <noreply@sparx.email>'),
  // Postal HTTP API. Empty → ConsoleTransport (logs rendered email instead
  // of relaying). In the cluster: http://postal.postal.svc.cluster.local:5000.
  POSTAL_API_BASE: z.string().default(''),
  POSTAL_API_KEY: z.string().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[email-worker] invalid environment:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(78); // EX_CONFIG
  }
  return result.data;
}

export const env: Env = parseEnv();
