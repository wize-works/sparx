// Prisma configuration — replaces the deprecated package.json#prisma block
// (Prisma 7 removes that, and the warning has been firing on every command).
//
// The schema is split per domain across prisma/schema/*.prisma. Migrations
// live in prisma/migrations as normal.

import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
