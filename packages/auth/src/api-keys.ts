// External API key issuance + verification.
//
// Used by the MCP transport (and any future external surface that wants a
// non-cookie auth path). Plaintext key is `sk_live_<8 random>_<32 random>`;
// the first 16 characters (`sk_live_<8 random>`) are stored as `keyPrefix`
// for fast row lookup, the remainder is SHA-256-hashed.
//
// SHA-256 is sufficient here — the suffix carries ~190 bits of entropy
// (32 base32 chars), so a precomputed-rainbow attack is meaningless. We
// don't need Argon2 (which exists to slow down brute-force against
// low-entropy user passwords).

import crypto from 'node:crypto';
import { authPrisma as prisma } from './prisma';

const PREFIX_TOKEN_BYTES = 5; // → 8 base32 chars after the `sk_live_` literal
const SUFFIX_TOKEN_BYTES = 20; // → 32 base32 chars
const PUBLIC_PREFIX = 'sk_live_';

export interface IssueArgs {
  tenantId: string;
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
  createdByUserId?: string | null;
}

export interface IssuedKey {
  /** The full key — show to the user ONCE, never again. */
  plaintext: string;
  /** Visible prefix (`sk_live_xxxxxxxx`) for the dashboard's "Keys" table. */
  prefix: string;
  id: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
}

export async function issueApiKey(args: IssueArgs): Promise<IssuedKey> {
  const prefix = `${PUBLIC_PREFIX}${base32(PREFIX_TOKEN_BYTES)}`;
  const suffix = base32(SUFFIX_TOKEN_BYTES);
  const plaintext = `${prefix}_${suffix}`;
  const keyHash = sha256(suffix);

  const row = await prisma.apiKey.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      keyPrefix: prefix,
      keyHash,
      scopes: args.scopes,
      expiresAt: args.expiresAt ?? null,
      createdByUserId: args.createdByUserId ?? null,
    },
  });

  return {
    plaintext,
    prefix,
    id: row.id,
    scopes: row.scopes,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export interface VerifiedKey {
  id: string;
  tenantId: string;
  scopes: string[];
  /** Identifier used as `actorId` in audit logs — falls back to the issuer
   *  when the key has one, otherwise the key id itself. */
  actorId: string;
}

/** Verifies a candidate plaintext key. Returns the resolved row on success;
 *  null if the prefix doesn't exist, the suffix doesn't match, the key was
 *  revoked, or it expired. Bumps `lastUsedAt` on success. */
export async function verifyApiKey(candidate: string): Promise<VerifiedKey | null> {
  const parsed = parseCandidate(candidate);
  if (!parsed) return null;

  const row = await prisma.apiKey.findUnique({ where: { keyPrefix: parsed.prefix } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  // Constant-time compare on the SHA-256 hex digests.
  const candidateHash = sha256(parsed.suffix);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(row.keyHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // Fire-and-forget last-used bump — never gate verification on the write.
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    id: row.id,
    tenantId: row.tenantId,
    scopes: row.scopes,
    actorId: row.createdByUserId ?? row.id,
  };
}

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listApiKeys(tenantId: string): Promise<ApiKeySummary[]> {
  const rows = await prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function revokeApiKey(tenantId: string, id: string): Promise<void> {
  await prisma.apiKey.updateMany({
    where: { id, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─── helpers ────────────────────────────────────────────────────────────

function parseCandidate(candidate: string): { prefix: string; suffix: string } | null {
  if (!candidate.startsWith(PUBLIC_PREFIX)) return null;
  // sk_live_<8>_<32>
  const lastUnderscore = candidate.lastIndexOf('_');
  if (lastUnderscore <= PUBLIC_PREFIX.length) return null;
  const prefix = candidate.slice(0, lastUnderscore);
  const suffix = candidate.slice(lastUnderscore + 1);
  if (prefix.length !== PUBLIC_PREFIX.length + 8) return null;
  if (suffix.length < 8) return null;
  return { prefix, suffix };
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32(byteLen: number): string {
  const bytes = crypto.randomBytes(byteLen);
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(acc >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(acc << (5 - bits)) & 0x1f];
  }
  return out;
}
