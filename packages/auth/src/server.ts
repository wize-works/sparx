import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { authPrisma } from './prisma';

// Sparx Better Auth server instance. One per process — same caching strategy
// as @sparx/db's prisma client so dev HMR does not leak adapters.
//
// Schema dependencies (packages/db/prisma/schema.prisma):
//   - User has Sparx extensions `tenantId` + `role` exposed via additionalFields
//   - Session / Account / Verification shapes match Better Auth's expectations
//
// The organization plugin (docs/16 §2) is intentionally NOT enabled yet — it
// would need an Organization/Member/Invitation table set the data layer has not
// landed. Tenant context is carried on User.tenantId until then.

declare global {
  var __sparxAuth: ReturnType<typeof createAuth> | undefined;
}

function createAuth() {
  return betterAuth({
    appName: 'Sparx',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(authPrisma, { provider: 'postgresql' }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        // Better Auth synthesizes the URL with its own token; we just hand it
        // off to the @sparx/email pipeline. In dev the console provider logs
        // to stdout — in prod SPARX_EMAIL_PROVIDER=postal swaps the transport.
        const { sendTemplate } = await import('@sparx/email');
        await sendTemplate({
          template: 'password-reset',
          to: user.email,
          props: {
            name: user.name ?? undefined,
            resetUrl: url,
            expiresInMinutes: 60,
          },
        });
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    user: {
      additionalFields: {
        tenantId: {
          type: 'string',
          required: true,
          input: false,
        },
        role: {
          type: 'string',
          required: false,
          defaultValue: 'editor',
          input: false,
        },
      },
    },

    advanced: {
      database: { generateId: false },
    },

    plugins: [nextCookies()],
  });
}

export const auth = globalThis.__sparxAuth ?? createAuth();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__sparxAuth = auth;
}

export type Auth = typeof auth;
