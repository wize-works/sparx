import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './hash';

describe('hashPassword / verifyPassword', () => {
  it('produces an argon2id hash distinct from the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies the correct password and rejects the wrong one', async () => {
    const hash = await hashPassword('s3cret-passw0rd');
    await expect(verifyPassword(hash, 's3cret-passw0rd')).resolves.toBe(true);
    await expect(verifyPassword(hash, 's3cret-passw0rd!')).resolves.toBe(false);
  });

  it('salts — the same password hashes to different digests', async () => {
    const a = await hashPassword('same-input');
    const b = await hashPassword('same-input');
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, 'same-input')).resolves.toBe(true);
    await expect(verifyPassword(b, 'same-input')).resolves.toBe(true);
  });

  it('returns false (never throws) on a malformed stored hash', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});
