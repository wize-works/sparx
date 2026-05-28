// Boot-time env validation. Same shape as services/media-worker/src/env.ts.
//
// Note: provider selection (console vs Postal), default From address, and
// Postal credentials are owned by @sparx/email — see
// packages/email/src/providers/index.ts. The worker doesn't pass them
// through directly.

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
  // Maximum in-flight messages. Rendering React Email + a single HTTP
  // POST per message is cheap, so we can pull more than media-worker.
  MAX_CONCURRENT: z.coerce.number().int().min(1).max(64).default(8),
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
