// Password hashing — Argon2id, the same algorithm and parameters Layer 1 uses
// (Better Auth's defaults, mirrored in packages/db/prisma/seed.ts and docs/16
// §1). Passwords are NEVER stored or logged in plaintext; only the hash this
// module produces is persisted.

import { hash, verify } from '@node-rs/argon2';

// `Algorithm.Argon2id` from @node-rs/argon2 is a const enum, which
// verbatimModuleSyntax disallows in value position. Inline the numeric value
// (see memory/feedback_verbatim_module_syntax_const_enums).
const ARGON2ID = 2;

const PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hash a plaintext password with Argon2id. */
export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, PARAMS);
}

/** Verify a plaintext password against a stored Argon2id hash. Returns false
 *  (never throws) on a malformed hash so a corrupt row can't 500 a login. */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    return false;
  }
}

// A precomputed valid hash to verify against when the email is unknown, so the
// "no such account" path spends roughly the same CPU as a real verify and the
// timing signal between the two cases is flattened. Computed once, lazily.
let dummyHash: Promise<string> | undefined;
export function dummyVerify(plaintext: string): Promise<boolean> {
  dummyHash ??= hashPassword('customer-auth-timing-flatten-constant');
  return dummyHash.then((h) => verifyPassword(h, plaintext));
}
