// One-off entrypoint for db-migrate-resolve-job — calls
// `prisma migrate resolve --rolled-back $RESOLVE_MIGRATION` against the
// prod database via the Cloud SQL Auth Proxy sidecar.
//
// Used when a failed migration leaves a row in `_prisma_migrations` that
// blocks every subsequent `prisma migrate deploy`. Marking the row as
// rolled-back lets the next deploy retry the (presumably-now-fixed)
// migration cleanly. Touches only `_prisma_migrations`; no data risk.
//
// Sidecar/secret bootstrap mirrors scripts/run-migrations.ts — kept inline
// (rather than extracted) so this hotfix script is self-contained and
// doesn't churn the existing migrate runner during a prod incident.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Client as PgClient } from 'pg';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'sparxworks';
const PROXY_HOST = process.env.PROXY_HOST ?? '127.0.0.1';
const PROXY_PORT = process.env.PROXY_PORT ?? '5432';
const DB_NAME = process.env.DB_NAME ?? 'sparx';

function requireMigration(): string {
  const value = process.env.RESOLVE_MIGRATION;
  if (!value) {
    console.error('[resolve] RESOLVE_MIGRATION env var is required.');
    process.exit(2);
  }
  return value;
}

const MIGRATION = requireMigration();

const sm = new SecretManagerServiceClient();

async function getSecret(name: string): Promise<string> {
  const [version] = await sm.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${name}/versions/latest`,
  });
  const payload = version.payload?.data?.toString();
  if (!payload) throw new Error(`Secret ${name} has no payload`);
  return payload.trim();
}

async function waitForProxy(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const client = new PgClient({
      host: PROXY_HOST,
      port: Number(PROXY_PORT),
      user: 'sparx_app',
      database: DB_NAME,
      connectionTimeoutMillis: 2_000,
    });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/password|authentication|SASL/i.test(msg)) return;
      await sleep(2_000);
    }
  }
  throw new Error(`Auth Proxy did not become reachable within ${timeoutMs}ms`);
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main(): Promise<void> {
  console.log(`[resolve] target migration: ${MIGRATION}`);
  console.log(`[resolve] fetching secrets from project ${PROJECT_ID}…`);
  const ownerPassword = await getSecret('sparx-db-owner-password');

  const baseHost = `${PROXY_HOST}:${PROXY_PORT}`;
  const migrationUrl = `postgresql://sparx_owner:${encodeURIComponent(ownerPassword)}@${baseHost}/${DB_NAME}?sslmode=disable`;

  console.log('[resolve] waiting for Auth Proxy sidecar…');
  await waitForProxy();

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: migrationUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
  };

  console.log(`[resolve] marking ${MIGRATION} as rolled-back…`);
  await run('pnpm', ['exec', 'prisma', 'migrate', 'resolve', '--rolled-back', MIGRATION], baseEnv);

  console.log(
    '[resolve] done. Re-run the standard db-migrate Job to apply the corrected migration.'
  );
}

main().catch((err: unknown) => {
  console.error('[resolve] failed:', err);
  process.exit(1);
});
