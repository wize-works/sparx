import { describe, expect, it } from 'vitest';
import { checkAddress } from './webhook-address';

describe('checkAddress', () => {
  it('accepts a full https address unchanged', () => {
    const result = checkAddress('https://stock.example.co.uk/hooks/updates');
    expect(result).toEqual({
      ok: true,
      url: 'https://stock.example.co.uk/hooks/updates',
      tidied: false,
    });
  });

  // The persona case: typed the way anyone says an address out loud.
  it('adds https:// when no scheme was typed, and says it did', () => {
    const result = checkAddress('stock.example.co.uk/hooks');
    expect(result).toEqual({
      ok: true,
      url: 'https://stock.example.co.uk/hooks',
      tidied: true,
    });
  });

  it('trims surrounding whitespace from a paste', () => {
    const result = checkAddress('  https://example.com/x  ');
    expect(result).toEqual({ ok: true, url: 'https://example.com/x', tidied: false });
  });

  it('refuses http:// and names the exact edit', () => {
    const result = checkAddress('http://example.com/hooks');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('https://');
    expect(result.reason).toContain('http://');
  });

  it('refuses another scheme rather than silently prefixing it', () => {
    const result = checkAddress('ftp://example.com/drop');
    expect(result.ok).toBe(false);
  });

  it('refuses an empty address', () => {
    expect(checkAddress('   ').ok).toBe(false);
  });

  it('refuses a bare word that is not a hostname', () => {
    expect(checkAddress('stockpage').ok).toBe(false);
  });

  it('refuses a hostname with a trailing dot', () => {
    expect(checkAddress('example.com.').ok).toBe(false);
  });

  it('allows localhost, which a developer testing an integration will use', () => {
    const result = checkAddress('localhost:4000/hooks');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe('https://localhost:4000/hooks');
  });

  it('refuses an address over the column limit', () => {
    const long = `https://example.com/${'a'.repeat(2100)}`;
    expect(checkAddress(long).ok).toBe(false);
  });

  it('keeps a query string and a port', () => {
    const result = checkAddress('https://example.com:8443/hooks?token=abc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe('https://example.com:8443/hooks?token=abc');
  });
});
