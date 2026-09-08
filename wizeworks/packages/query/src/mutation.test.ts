import { describe, expect, it } from 'vitest';
import { useMutation as tanstackUseMutation } from '@tanstack/react-query';

import * as pkg from './index';
import { callerHandledError, shownInPlace, useMutation, writeIdentity } from './mutation';

describe('the package shadows TanStack useMutation', () => {
  // `index.ts` does `export * from '@tanstack/react-query'` AND exports its own
  // `useMutation` after it. The explicit export is meant to win. If it ever
  // stops winning, every call site keeps compiling and the failed-write reporter
  // silently goes back to announcing failures the call site already announced —
  // exactly the shape of bug this file exists to fix (issue 304).
  it('hands callers ours, not TanStack’s', () => {
    expect(pkg.useMutation).toBe(useMutation);
    expect(pkg.useMutation).not.toBe(tanstackUseMutation);
  });

  it('still re-exports the rest of TanStack', () => {
    expect(typeof pkg.useQuery).toBe('function');
    expect(typeof pkg.QueryClient).toBe('function');
  });
});

describe('callerHandledError', () => {
  it('is false for meta that never went through the hook', () => {
    expect(callerHandledError(undefined)).toBe(false);
    expect(callerHandledError(null)).toBe(false);
    expect(callerHandledError({})).toBe(false);
    expect(callerHandledError({ writing: 'the order' })).toBe(false);
  });

  // A reporter that cannot tell must SPEAK rather than stay silent — a duplicate
  // toast is annoying, a silent failed write is the thing the net exists for.
  it('is false for a malformed flag rather than assuming somebody spoke', () => {
    expect(callerHandledError({ __sparxCallerHandlers: 'yes' })).toBe(false);
    expect(callerHandledError({ __sparxCallerHandlers: null })).toBe(false);
    expect(callerHandledError({ __sparxCallerHandlers: {} })).toBe(false);
    expect(callerHandledError({ __sparxCallerHandlers: { onError: 'true' } })).toBe(false);
  });

  it('reads the flag the hook leaves behind', () => {
    expect(callerHandledError({ __sparxCallerHandlers: { onError: true } })).toBe(true);
    expect(callerHandledError({ __sparxCallerHandlers: { onError: false } })).toBe(false);
  });

  it('sees the flag flip, because meta carries the object by reference', () => {
    const handlers = { onError: false };
    const meta = { __sparxCallerHandlers: handlers };
    expect(callerHandledError(meta)).toBe(false);
    handlers.onError = true;
    expect(callerHandledError(meta)).toBe(true);
  });
});

describe('writeIdentity', () => {
  it('is undefined for meta that never went through the hook', () => {
    expect(writeIdentity(undefined)).toBeUndefined();
    expect(writeIdentity(null)).toBeUndefined();
    expect(writeIdentity({})).toBeUndefined();
    expect(writeIdentity({ __sparxCallerHandlers: 'yes' })).toBeUndefined();
  });

  // The point of the identity is that a failure and the retry that fixed it are
  // two different mutations from ONE hook. If it did not survive the difference,
  // a stale "that didn't save" would sit beside the success that replaced it.
  it('is the same object for two mutations from one hook', () => {
    const handlers = { onError: false };
    const first = { __sparxCallerHandlers: handlers, writing: 'the redirect' };
    const second = { __sparxCallerHandlers: handlers };
    expect(writeIdentity(first)).toBe(writeIdentity(second));
  });

  it('separates two different hooks, so neither withdraws the other’s message', () => {
    expect(writeIdentity({ __sparxCallerHandlers: { onError: false } })).not.toBe(
      writeIdentity({ __sparxCallerHandlers: { onError: false } })
    );
  });
});

describe('shownInPlace', () => {
  // It is a signal, not behavior: passing it means "the surface is rendering
  // this failure, stay quiet", and the reporter reads that off the meta flag the
  // hook sets for ANY per-call onError.
  it('marks the write as handled without doing anything itself', () => {
    const handlers = { onError: false };
    const meta = { __sparxCallerHandlers: handlers };
    expect(shownInPlace()).toBeUndefined();
    expect(callerHandledError(meta)).toBe(false);

    handlers.onError = typeof shownInPlace === 'function';
    expect(callerHandledError(meta)).toBe(true);
  });
});
