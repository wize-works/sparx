import { describe, expect, it } from 'vitest';

import { expiryFromNow, hashToken, mintToken, SESSION_COOKIE_OPTIONS } from './session';

describe('mintToken', () => {
  it('returns a base64url token whose hash is a 64-char sha256 hex', () => {
    const { token, tokenHash } = mintToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashToken(token));
  });

  it('never collides across mints (token + hash both unique)', () => {
    const tokens = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const { token, tokenHash } = mintToken();
      tokens.add(token);
      hashes.add(tokenHash);
    }
    expect(tokens.size).toBe(500);
    expect(hashes.size).toBe(500);
  });

  it('hashToken is deterministic and does not echo the token', () => {
    const h = hashToken('a-known-token');
    expect(hashToken('a-known-token')).toBe(h);
    expect(h).not.toContain('a-known-token');
  });
});

describe('expiryFromNow', () => {
  it('returns a future Date the requested number of seconds out', () => {
    const before = Date.now();
    const exp = expiryFromNow(3600);
    expect(exp.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(exp.getTime()).toBeLessThan(before + 3600 * 1000 + 5000);
  });
});

describe('SESSION_COOKIE_OPTIONS', () => {
  it('is httpOnly + SameSite=Lax + Secure + root path', () => {
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe('lax');
    expect(SESSION_COOKIE_OPTIONS.secure).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.path).toBe('/');
  });
});
