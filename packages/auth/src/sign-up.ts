import { authPrisma } from './prisma';
import { auth } from './server';

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

  // Email must be globally unique — Better Auth's sign-in queries by email
  // alone, so duplicates produce ambiguous lookups (and historically caused
  // "Invalid password hash" failures when sign-in matched an older row with
  // a stale hash format). The DB also enforces this via the unique
  // constraint on users.email, but pre-checking gives the caller a clean
  // typed error instead of a P2002.
  const existingUser = await authPrisma.user.findFirst({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    throw new SignUpError('EMAIL_TAKEN', 'An account with that email already exists.');
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

    // Welcome email is fire-and-forget via Pub/Sub — email-worker pulls
    // the event and handles the Postal POST. Publishing is ~10–50ms
    // (single Google API call); a Pub/Sub outage must never roll back
    // an otherwise successful sign-up, so we log + swallow.
    try {
      const dashboardUrl =
        (process.env.BETTER_AUTH_URL ?? 'http://localhost:3001').replace(/\/$/, '') + '/welcome';
      const { publishAuthEmail } = await import('./email-events');
      await publishAuthEmail({
        tenantId,
        actorId: userId,
        template: 'welcome-merchant',
        to: email,
        props: {
          name: input.name,
          storeName: input.storeName,
          dashboardUrl,
        },
      });
    } catch (err) {
      // Structured stdout JSON — GKE Cloud Logging parses `severity` + the
      // rest as labels, so this is greppable in Logs Explorer without
      // dragging pino into the Next.js server bundle for one log line.
      process.stderr.write(
        JSON.stringify({
          severity: 'ERROR',
          source: 'auth.sign-up',
          message: 'welcome email publish failed',
          tenantId,
          userId,
          err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        }) + '\n'
      );
    }

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
