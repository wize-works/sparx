// Boot-time env validation. Cloud Run entrypoint (Pub/Sub push), so we no
// longer need GCP_PROJECT_ID / PUBSUB_SUBSCRIPTION / MAX_CONCURRENT — those
// were pull-loop concerns. Concurrency is now controlled by Cloud Run's
// containerConcurrency (TF-managed).
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
  DATABASE_URL: z.string().min(1).optional(),
  // Cloud Run injects PORT (default 8080). Honoured here so the listener
  // matches what the platform expects.
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // Expected `email` claim in the Pub/Sub push OIDC token — defense in
  // depth on top of Cloud Run's frontend auth check. Set this to the SA
  // configured as the push subscription's oidc_token.service_account_email
  // (sparx-pubsub-invoker@<project>.iam.gserviceaccount.com). Leave unset
  // for local dev; the worker will accept any caller in that case.
  PUBSUB_INVOKER_SA: z.string().email().optional(),
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
