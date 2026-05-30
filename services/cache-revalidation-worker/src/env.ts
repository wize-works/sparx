// Boot-time env validation. Cloud Run Pub/Sub-push entrypoint, same shape as
// services/commerce-indexer.

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // Expected `email` claim in the Pub/Sub push OIDC token — defense in depth
  // on top of Cloud Run's frontend auth check. Leave unset for local dev.
  PUBSUB_INVOKER_SA: z.string().email().optional(),
  // The storefront's on-demand revalidation endpoint + its shared secret.
  // The storefront serves every tenant (host-multiplexed) from one deployment,
  // so this is a single internal URL; the tenant is carried in the POST body.
  STOREFRONT_REVALIDATE_URL: z
    .string()
    .url()
    .default('http://storefront.sparx-prod.svc.cluster.local/api/revalidate'),
  SPARX_REVALIDATE_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[cache-revalidation-worker] invalid environment:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(78); // EX_CONFIG
  }
  return result.data;
}

export const env: Env = parseEnv();
