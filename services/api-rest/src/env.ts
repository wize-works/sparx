// Boot-time env validation. Anything missing or malformed fails fast with a
// readable error, before Fastify starts listening — better than a 500 on the
// first request. Every env var the service reads must be declared here.
//
// Local dev reads `.env` (or `.env.local`) via dotenv; in prod the k8s
// Deployment hydrates the env from the sparx-app-env ConfigMap and the
// sparx-app-secrets Secret, so dotenv silently no-ops when neither file
// exists.

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  // Shared with the dashboard (and any other internal Sparx service) — used
  // to sign + verify short-lived internal-trust JWTs that carry the staff
  // session's {tenantId, userId, role} from the dashboard to api-rest.
  SPARX_INTERNAL_JWT_SECRET: z.string().min(32),
  // Optional: when set, the Pub/Sub publisher uses Google Cloud Pub/Sub;
  // otherwise it logs to stdout and is a no-op (dev default).
  GCP_PROJECT_ID: z.string().optional(),
  PUBSUB_TOPIC: z.string().default('sparx.events'),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
     
    console.error('[api-rest] invalid environment:');
    for (const issue of result.error.issues) {
       
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(78); // EX_CONFIG
  }
  return result.data;
}

export const env: Env = parseEnv();
