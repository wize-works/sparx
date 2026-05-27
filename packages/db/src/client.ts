import { PrismaClient } from '@prisma/client';

// Single PrismaClient per process. Next.js dev mode reloads modules on every
// request, which would otherwise leak connections — we cache on `globalThis`.

const globalForPrisma = globalThis as unknown as {
  __sparxPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__sparxPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__sparxPrisma = prisma;
}
