'use client';

// `useMutation`, with one fact added that TanStack keeps to itself.
//
// A global "that write failed" reporter has exactly one decision to make: has
// anybody already told the operator? A call site with its own `onError` owns the
// conversation and usually says something better — it can name the invoice,
// restore the form, undo the optimistic row. Toasting on top of that says the
// same sentence twice and teaches people to ignore both.
//
// TanStack gives a watcher no way to answer that question. Handlers passed to
// `mutate(variables, { onError })` are stored in `MutationObserver`'s PRIVATE
// `#mutateOptions`; the mutation that lands in the cache is built from the
// `useMutation` options alone. So `mutation.options.onError` is undefined for
// every per-call handler, and a reporter testing it concludes nobody spoke —
// on 496 call sites in the workbench, each of which had just spoken (issue 304).
//
// The only place the answer exists is the `mutate` call itself, so it is caught
// here and left on the mutation's `meta`, which the cache does carry.

import {
  useMutation as useBaseMutation,
  type DefaultError,
  type MutateOptions,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

/** Namespaced so it cannot collide with a caller's own meta keys. */
const CALLER_HANDLERS = '__sparxCallerHandlers';

interface CallerHandlers {
  /** Set on every `mutate` call, so a later call with no handler clears it. */
  onError: boolean;
}

/**
 * Did the code that called `mutate` pass its own `onError`?
 *
 * Read this from `mutation.meta` in a mutation-cache subscriber. False for a
 * mutation that never went through this hook, which is the safe answer: a
 * reporter that cannot tell should speak rather than stay silent.
 *
 * One honest limit: the flag belongs to the HOOK, not to an individual mutation,
 * because `meta` is shared by every mutation the hook builds. Two calls from one
 * hook instance in flight at once, one handled and one not, share the last
 * answer. The cost is a missing or an extra toast, never a lost write.
 */
export function callerHandledError(meta: unknown): boolean {
  if (typeof meta !== 'object' || meta === null) return false;
  const held = (meta as Record<string, unknown>)[CALLER_HANDLERS];
  if (typeof held !== 'object' || held === null) return false;
  return (held as CallerHandlers).onError === true;
}

/**
 * TanStack's `useMutation`, re-exported from `@wizeworks/query` so every caller
 * gets this for free. Identical in every other respect — same options, same
 * result, same generics.
 */
export function useMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
  queryClient?: QueryClient
): UseMutationResult<TData, TError, TVariables, TContext> {
  // One object per hook instance, carried BY REFERENCE on meta so that flipping
  // a field here is visible to whatever later reads the mutation off the cache.
  const handlers = useRef<CallerHandlers>({ onError: false }).current;

  const base = useBaseMutation<TData, TError, TVariables, TContext>(
    { ...options, meta: { ...options.meta, [CALLER_HANDLERS]: handlers } },
    queryClient
  );

  const { mutate: baseMutate, mutateAsync: baseMutateAsync } = base;

  const mutate = useCallback(
    (variables: TVariables, callOptions?: MutateOptions<TData, TError, TVariables, TContext>) => {
      handlers.onError = typeof callOptions?.onError === 'function';
      baseMutate(variables, callOptions);
    },
    [baseMutate, handlers]
  );

  const mutateAsync = useCallback(
    (variables: TVariables, callOptions?: MutateOptions<TData, TError, TVariables, TContext>) => {
      handlers.onError = typeof callOptions?.onError === 'function';
      return baseMutateAsync(variables, callOptions);
    },
    [baseMutateAsync, handlers]
  );

  return { ...base, mutate, mutateAsync };
}

/**
 * An opaque, stable identity for the hook instance a mutation came from.
 *
 * Every `mutate()` call builds a NEW `Mutation` with a new `mutationId`, so a
 * failure and the retry that fixes it are two different mutations as far as the
 * cache is concerned. The only thing they share is the hook they came from —
 * this object, carried by reference on `meta`. A watcher that needs to connect
 * "that write failed" to "the same write just succeeded" keys on this.
 *
 * Undefined for a mutation that never went through this hook, which callers
 * must handle rather than key on a fallback: two unrelated mutations sharing a
 * fallback key would close each other's messages.
 */
export function writeIdentity(meta: unknown): object | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined;
  const held = (meta as Record<string, unknown>)[CALLER_HANDLERS];
  return typeof held === 'object' && held !== null ? held : undefined;
}

/**
 * "The surface is showing this failure itself — stay quiet."
 *
 * Pass it where an `onError` handler goes:
 *
 *     create.mutate(input, { onSuccess: close, onError: shownInPlace });
 *
 * A dialog that renders `create.error` in an Alert has already said what went
 * wrong, and usually says it better than a toast can: beside the field, with
 * the typed values still there, sometimes with the way out. But it says it by
 * RENDERING, and a mutation-cache watcher cannot see a render. Without this the
 * call site looks exactly like one that said nothing, so the net speaks too and
 * the same sentence arrives twice — once with the remedy, once without, and the
 * second one never dismisses itself.
 *
 * A no-op is the honest implementation. The signal is not what it does; it is
 * that the caller claimed the conversation.
 */
export function shownInPlace(): void {
  // Deliberately empty — see above.
}
