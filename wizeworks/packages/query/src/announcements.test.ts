import { describe, expect, it } from 'vitest';
import { createWriteAnnouncements } from './announcements';

describe('createWriteAnnouncements', () => {
  it('has nothing to take back before anything is announced', () => {
    expect(createWriteAnnouncements().take({})).toBeUndefined();
  });

  // The whole point: the failure and the retry that fixed it are two different
  // mutations from one hook, so the success has to find the failure's message.
  it('gives back the message announced for the same write', () => {
    const announcements = createWriteAnnouncements();
    const hook = {};
    announcements.keep(hook, 'toast-1');
    expect(announcements.take(hook)).toBe('toast-1');
  });

  it('takes a message back once, so a later success closes nothing', () => {
    const announcements = createWriteAnnouncements();
    const hook = {};
    announcements.keep(hook, 'toast-1');
    announcements.take(hook);
    expect(announcements.take(hook)).toBeUndefined();
  });

  it('keeps two writes apart, so neither closes the other’s message', () => {
    const announcements = createWriteAnnouncements();
    const redirects = {};
    const products = {};
    announcements.keep(redirects, 'toast-redirects');
    announcements.keep(products, 'toast-products');
    expect(announcements.take(products)).toBe('toast-products');
    expect(announcements.take(redirects)).toBe('toast-redirects');
  });

  it('replaces the message for a write that fails twice', () => {
    const announcements = createWriteAnnouncements();
    const hook = {};
    announcements.keep(hook, 'toast-1');
    announcements.keep(hook, 'toast-2');
    expect(announcements.take(hook)).toBe('toast-2');
  });

  // A write with no identity never went through our `useMutation`. Silently
  // sharing a fallback key would let two unrelated failures cancel each other.
  it('does no bookkeeping for an unidentified write', () => {
    const announcements = createWriteAnnouncements();
    announcements.keep(undefined, 'toast-1');
    expect(announcements.take(undefined)).toBeUndefined();
  });
});
