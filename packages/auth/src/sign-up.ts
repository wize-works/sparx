import { authPrisma } from './prisma.js';
import { auth } from './server.js';

// Merchant self-service signup. Better Auth's stock `signUpEmail` assumes
// one user = one account. Sparx needs each new merchant to also get a Tenant
// row, so we do the two writes ourselves and let Better Auth handle session
// creation via signIn afterwards.
//
// This is the v0 path; richer onboarding (plan picker, store template,
// invitation flow) per docs/15 will replace this.

export interface SignUpMerchantInput {
  email: string;
  password: string;
  name: string;
  storeName: string;
}

export interface SignUpMerchantResult {
  ok: true;
  userId: string;
  tenantId: string;
}

export class SignUpError extends Error {
  constructor(
    public code: 'EMAIL_TAKEN' | 'SLUG_TAKEN' | 'INVALID_INPUT',
    message: string
  ) {
    super(message);
    this.name = 'SignUpError';
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export async function signUpMerchant(input: SignUpMerchantInput): Promise<SignUpMerchantResult> {
  const email = input.email.trim().toLowerCase();
  const slug = slugify(input.storeName);

  if (!slug) {
    throw new SignUpError('INVALID_INPUT', 'Store name must contain letters or numbers.');
  }

  const existingTenantSlug = await authPrisma.tenant.findUnique({ where: { slug } });
  if (existingTenantSlug) {
    throw new SignUpError('SLUG_TAKEN', `Store URL "${slug}" is already taken.`);
  }

  // Better Auth's password hasher (scrypt by default; configurable to Argon2).
  // Going through $context keeps us aligned with whatever the auth instance
  // is configured to use — no risk of mismatched hashes at sign-in time.
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(input.password);

  try {
    const { userId, tenantId } = await authPrisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.storeName,
          slug,
          email,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          name: input.name,
          emailVerified: false,
          tenantId: tenant.id,
          role: 'owner',
        },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          providerId: 'credential',
          accountId: user.id,
          password: passwordHash,
        },
      });

      return { userId: user.id, tenantId: tenant.id };
    });

    return { ok: true, userId, tenantId };
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
      if (target.includes('email')) {
        throw new SignUpError('EMAIL_TAKEN', 'An account with that email already exists.');
      }
      if (target.includes('slug')) {
        throw new SignUpError('SLUG_TAKEN', `Store URL "${slug}" is already taken.`);
      }
    }
    throw err;
  }
}
