#!/usr/bin/env tsx
// RLS audit — static analysis over every Prisma migration SQL file.
//
// For every CREATE TABLE that carries a `tenant_id` column, asserts the
// same migration (or any later one) contains:
//
//   • ALTER TABLE ... ENABLE ROW LEVEL SECURITY
//   • ALTER TABLE ... FORCE  ROW LEVEL SECURITY    (per CLAUDE.md hand-edit rule)
//   • CREATE POLICY ... ON ...                     (tenant_isolation policy)
//
// Junction tables (no `tenant_id` column, e.g. commerce_category_products)
// are skipped — tenant scoping rides through their FK parents via
// ON DELETE CASCADE.
//
// Exceptions are explicit:
//   • Auth tables (users, sessions, accounts, etc.) are ENABLE-only by
//     design — Better Auth needs cross-tenant reads at sign-in time
//     (see [memory] sparx_db_rls_pattern.md).
//   • Public reference tables (commerce_vehicle_*) are intentionally
//     tenant-shared.
//
// Exit code: 0 on clean, 1 on any failure. Designed to be cheap enough
// to run in pre-push and CI.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'prisma', 'migrations');

// Tables that are ENABLE-only (no FORCE) by design. Each entry needs a
// one-line reason; reviewers should push back on additions.
const ENABLE_ONLY_TABLES = new Set<string>([
  'users', // Better Auth sign-in lookup needs cross-tenant scan
  'sessions',
  'accounts',
  'verifications',
  'verification_tokens',
  'api_keys', // tenant-scoped at app layer; ENABLE-only to allow scoping by api_key_id
]);

// Tables that are tenant-shared reference data — no RLS required.
const SHARED_REFERENCE_TABLES = new Set<string>([
  'commerce_vehicle_makes',
  'commerce_vehicle_models',
  'commerce_vehicle_engines',
]);

interface TableDef {
  name: string;
  migration: string;
  hasTenantId: boolean;
}

interface RlsState {
  hasEnable: boolean;
  hasForce: boolean;
  hasPolicy: boolean;
}

interface AuditFinding {
  table: string;
  migration: string;
  missing: string[];
}

function main(): void {
  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => fs.statSync(path.join(MIGRATIONS_DIR, f)).isDirectory())
    .sort();

  const tables: TableDef[] = [];
  const rlsByTable = new Map<string, RlsState>();

  for (const m of migrations) {
    const sqlPath = path.join(MIGRATIONS_DIR, m, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // CREATE TABLE — capture each table and whether it has tenant_id.
    const createRe = /CREATE TABLE "?([a-z_][a-z0-9_]*)"?\s*\(([\s\S]*?)\n\)\s*;/gi;
    let cm: RegExpExecArray | null;
    while ((cm = createRe.exec(sql)) !== null) {
      const name = cm[1]!;
      const body = cm[2]!;
      const hasTenantId = /"?tenant_id"?\s+UUID/i.test(body);
      tables.push({ name, migration: m, hasTenantId });
      if (!rlsByTable.has(name)) {
        rlsByTable.set(name, { hasEnable: false, hasForce: false, hasPolicy: false });
      }
    }

    // ENABLE / FORCE — collect for every table seen so far.
    const enableRe = /ALTER TABLE "?([a-z_][a-z0-9_]*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
    let em: RegExpExecArray | null;
    while ((em = enableRe.exec(sql)) !== null) {
      const t = em[1]!;
      const state = rlsByTable.get(t) ?? { hasEnable: false, hasForce: false, hasPolicy: false };
      state.hasEnable = true;
      rlsByTable.set(t, state);
    }
    const forceRe = /ALTER TABLE "?([a-z_][a-z0-9_]*)"?\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi;
    let fm: RegExpExecArray | null;
    while ((fm = forceRe.exec(sql)) !== null) {
      const t = fm[1]!;
      const state = rlsByTable.get(t) ?? { hasEnable: false, hasForce: false, hasPolicy: false };
      state.hasForce = true;
      rlsByTable.set(t, state);
    }
    const policyRe = /CREATE POLICY\s+"?[a-z_][a-z0-9_]*"?\s+ON\s+"?([a-z_][a-z0-9_]*)"?/gi;
    let pm: RegExpExecArray | null;
    while ((pm = policyRe.exec(sql)) !== null) {
      const t = pm[1]!;
      const state = rlsByTable.get(t) ?? { hasEnable: false, hasForce: false, hasPolicy: false };
      state.hasPolicy = true;
      rlsByTable.set(t, state);
    }
  }

  // Dedupe table list by name; last definition wins (some are altered later).
  const tablesByName = new Map<string, TableDef>();
  for (const t of tables) tablesByName.set(t.name, t);

  const findings: AuditFinding[] = [];

  for (const t of tablesByName.values()) {
    if (SHARED_REFERENCE_TABLES.has(t.name)) continue;
    if (!t.hasTenantId) continue; // Junction tables ride through FK parents.

    const state = rlsByTable.get(t.name) ?? {
      hasEnable: false,
      hasForce: false,
      hasPolicy: false,
    };

    const missing: string[] = [];
    if (!state.hasEnable) missing.push('ENABLE ROW LEVEL SECURITY');

    if (!ENABLE_ONLY_TABLES.has(t.name)) {
      if (!state.hasForce) missing.push('FORCE ROW LEVEL SECURITY');
      if (!state.hasPolicy) missing.push('CREATE POLICY tenant_isolation');
    }

    if (missing.length > 0) {
      findings.push({ table: t.name, migration: t.migration, missing });
    }
  }

  const totalTenantTables = [...tablesByName.values()].filter(
    (t) => t.hasTenantId && !SHARED_REFERENCE_TABLES.has(t.name)
  ).length;

  console.log(`Audited ${tablesByName.size} tables (${totalTenantTables} tenant-scoped).`);
  console.log(`  ENABLE-only by design: ${ENABLE_ONLY_TABLES.size}`);
  console.log(`  Shared reference (no RLS): ${SHARED_REFERENCE_TABLES.size}`);

  if (findings.length === 0) {
    console.log('\nOK — every tenant-scoped table has the required RLS clauses.');
    process.exit(0);
  }

  console.error(`\nFAIL — ${findings.length} table(s) missing RLS clauses:\n`);
  for (const f of findings) {
    console.error(`  ${f.table}  (introduced in ${f.migration})`);
    for (const m of f.missing) console.error(`    - missing: ${m}`);
  }
  console.error(
    '\nFix: hand-edit the relevant migration SQL to add the missing clauses (Prisma will not generate them).'
  );
  process.exit(1);
}

main();
