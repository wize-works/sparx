// Entrypoint for the migration K8s Job (see k8s/sparx-prod/db-migrate-job.yaml).
//
// Flow:
//   1. Pull sparx_app + sparx_owner passwords from Secret Manager (the Pod's
//      Workload Identity SA has roles/secretmanager.secretAccessor).
//   2. Wait until the Cloud SQL Auth Proxy sidecar is listening on
//      localhost:5432 — the sidecar can take a few seconds to start.
//   3. Run sql/cloud-sql-bootstrap.sql as sparx_owner (idempotent grants).
//   4. Reconcile any migration-directory renames against `_prisma_migrations`
//      so `prisma migrate deploy` sees a consistent on-disk + DB state.
//   5. Run `prisma migrate deploy`.
//   6. If env RUN_SEED=true, run the seed.
//
// Any step that fails causes a non-zero exit so the K8s Job goes to Failed.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Client as PgClient } from 'pg';

// Known migration-directory renames. Each entry is applied idempotently:
// we only rename when the OLD row exists in `_prisma_migrations` and the
// NEW row doesn't. After the first deploy that fixes prod, every later
// deploy is a no-op for that entry.
//
// Add an entry here whenever a migration directory is renamed in the repo
// (e.g. to fix alphabetical ordering for Prisma's shadow-DB replay).
const KNOWN_MIGRATION_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['20260528070458_cms_index_alignment', '20260528100300_cms_index_alignment'],
];

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'sparxworks';
const PROXY_HOST = process.env.PROXY_HOST ?? '127.0.0.1';
const PROXY_PORT = process.env.PROXY_PORT ?? '5432';
const DB_NAME = process.env.DB_NAME ?? 'sparx';
const RUN_SEED = process.env.RUN_SEED === 'true';

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
      // Intentionally no password — we expect this to fail authentication, but
      // a failed-auth response proves the proxy is reachable. We swallow the
      // auth error and treat it as "proxy is up".
      connectionTimeoutMillis: 2_000,
    });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/password|authentication|SASL/i.test(msg)) return; // proxy reachable
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

// Apply KNOWN_MIGRATION_RENAMES against `_prisma_migrations` so the table
// matches the renamed directories on disk before `prisma migrate deploy`
// runs. Without this, deploy would either re-apply already-executed SQL
// under the new name (and fail) or refuse to proceed.
//
// Idempotency: each rename only fires when the OLD row exists and the NEW
// one doesn't. After the first successful deploy past a rename, all later
// deploys log "no-op" for that entry. Connects as sparx_owner so we can
// UPDATE the _prisma_migrations table regardless of RLS.
async function reconcileMigrationRenames(connectionUrl: string): Promise<void> {
  if (KNOWN_MIGRATION_RENAMES.length === 0) return;
  const client = new PgClient({ connectionString: connectionUrl });
  await client.connect();
  try {
    for (const [oldName, newName] of KNOWN_MIGRATION_RENAMES) {
      const { rows } = await client.query<{ migration_name: string }>(
        'SELECT migration_name FROM _prisma_migrations WHERE migration_name IN ($1, $2)',
        [oldName, newName]
      );
      const names = new Set(rows.map((r) => r.migration_name));
      if (names.has(newName)) {
        console.log(`[migrate] rename ${oldName} → ${newName}: already applied, skipping.`);
        continue;
      }
      if (!names.has(oldName)) {
        console.log(`[migrate] rename ${oldName} → ${newName}: no row to rename, skipping.`);
        continue;
      }
      const result = await client.query(
        'UPDATE _prisma_migrations SET migration_name = $1 WHERE migration_name = $2',
        [newName, oldName]
      );
      if (result.rowCount !== 1) {
        throw new Error(
          `rename ${oldName} → ${newName}: expected to update 1 row, updated ${result.rowCount}`
        );
      }
      console.log(`[migrate] renamed ${oldName} → ${newName}.`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  console.log(`[migrate] fetching secrets from project ${PROJECT_ID}…`);
  const [appPassword, ownerPassword] = await Promise.all([
    getSecret('sparx-db-app-password'),
    getSecret('sparx-db-owner-password'),
  ]);

  const baseHost = `${PROXY_HOST}:${PROXY_PORT}`;
  const databaseUrl = `postgresql://sparx_app:${encodeURIComponent(appPassword)}@${baseHost}/${DB_NAME}?sslmode=disable`;
  const migrationUrl = `postgresql://sparx_owner:${encodeURIComponent(ownerPassword)}@${baseHost}/${DB_NAME}?sslmode=disable`;

  console.log('[migrate] waiting for Auth Proxy sidecar…');
  await waitForProxy();

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
  };

  console.log('[migrate] applying bootstrap grants as sparx_owner…');
  await run(
    'pnpm',
    [
      'exec',
      'prisma',
      'db',
      'execute',
      '--url',
      migrationUrl,
      '--file',
      'sql/cloud-sql-bootstrap.sql',
    ],
    baseEnv
  );

  console.log('[migrate] reconciling known migration renames…');
  await reconcileMigrationRenames(migrationUrl);

  console.log('[migrate] running prisma migrate deploy…');
  await run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], baseEnv);

  if (RUN_SEED) {
    console.log('[migrate] running seed…');
    await run('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], baseEnv);
  } else {
    console.log('[migrate] RUN_SEED!=true, skipping seed.');
  }

  console.log('[migrate] done.');
}

main().catch((err: unknown) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
