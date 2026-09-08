'use client';

// The failed-save safety net.
//
// Error boundaries catch renders. They do not catch a WRITE — a mutation
// rejects inside a promise, React never sees it, and every boundary in this app
// stays green while the operator's change quietly did not happen. That is the
// worst failure the workbench has, because the screen still shows what they
// typed: nothing looks wrong, and they find out when the order never shipped.
//
// So every mutation is watched here, in one place, rather than trusted to 132
// call sites each remembering. The rule is:
//
//   • ALWAYS report it. Telemetry is unconditional and independent of whether
//     anything was shown — a write that fails for everyone must be visible to us
//     even where a surface handles it beautifully.
//   • Announce it ONLY if nobody else did. A mutation with its own `onError` has
//     a call site that owns the conversation (usually a better one: it can name
//     the invoice, restore the form, undo the optimistic row). Toasting on top
//     would say the same thing twice and teach people to ignore both. A surface
//     that instead RENDERS the error — an Alert inside the dialog, beside the
//     field, with the way out on it — has spoken just as clearly, but no watcher
//     can see a render, so it says so by passing `shownInPlace`.
//   • WITHDRAW it once it stops being true. The toast never dismisses itself, so
//     a retry that succeeds would otherwise leave "that didn't save" sitting
//     beside "saved" with nothing to say which one is current.
//
// This is a NET, not the answer. A surface that can say something specific still
// should. What this guarantees is a floor: no failed write is ever silent.
//
// It deliberately never fires for an OFFLINE write, and that is not a hole.
// TanStack's default `networkMode: 'online'` PAUSES a mutation started with no
// connection rather than failing it, and resumes it on reconnect — so the change
// is queued, not lost, and there is nothing to apologise for. The status bar
// says "Offline — changes can't save right now" while that is true, which is the
// honest report. Adding a failure toast here would announce a loss that has not
// happened.

import { useEffect, useRef } from 'react';
import {
  callerHandledError,
  createWriteAnnouncements,
  useQueryClient,
  writeIdentity,
} from '@wizeworks/query';
import { useToast } from '@wizeworks/silicaui-react';
import { describeWriteFailure } from '../lib/api/write-failure';
import { readWriteMeta } from '../lib/api/write-meta';
import { reportCrash } from '../lib/analytics';

export function WriteFailureReporter(): null {
  const queryClient = useQueryClient();
  const toast = useToast();
  // `toast.add`, never the manager — its identity churns on every toast in the
  // app, and re-subscribing to the mutation cache on that churn would drop
  // in-flight notifications. Same trap as components/update-notifier.tsx.
  const addToast = toast.add;
  // `close` goes through a ref instead of the dependency list for the same
  // reason: re-subscribing mid-write would drop the notification we are here to
  // deliver, and this one is not worth the risk of finding out it churns.
  const closeToast = useRef(toast.close);
  closeToast.current = toast.close;

  const announcements = useRef(createWriteAnnouncements());

  useEffect(() => {
    const cache = queryClient.getMutationCache();
    const withdraw = (identity: object) => {
      const shown = announcements.current.take(identity);
      if (shown !== undefined) closeToast.current(shown);
    };

    return cache.subscribe((event) => {
      if (event.type !== 'updated') return;
      const identity = writeIdentity(event.mutation.meta);

      // The same write just landed, so what we said about the last attempt is no
      // longer true. A failure toast stays until dismissed BY DESIGN — which
      // means that without this it sits beside the success message contradicting
      // it, and the person has no way to tell which one is current.
      if (event.action.type === 'success') {
        if (identity) withdraw(identity);
        return;
      }
      if (event.action.type !== 'error') return;

      const error: unknown = event.action.error;
      const meta = readWriteMeta(event.mutation.meta);
      const failure = describeWriteFailure(error);

      // Unconditional, and BEFORE the display decision — a return path added
      // below must never be able to skip the report.
      reportCrash(error, {
        boundary: 'mutation',
        outcome: failure.code,
        ...(meta.writing ? { writing: meta.writing } : {}),
        ...(failure.reference ? { requestId: failure.reference } : {}),
      });

      // Nobody asked for this write, so its failure is not theirs to hear.
      if (meta.housekeeping === true) return;
      // The call site is handling it, so it owns the conversation. Two forms
      // mean the same thing and both count: `onError` on the useMutation itself,
      // and `onError` passed to a component's own `mutate(vars, { onError })`.
      //
      // The second used to be missed, and this comment used to claim it "also
      // lands here". It does not — TanStack keeps per-call handlers in the
      // observer's private `#mutateOptions`, and the mutation the cache carries
      // is built from the hook's options alone. So 496 call sites that had just
      // apologised in their own words got a second toast saying the same
      // sentence, one of which never dismisses itself (issue 304). @wizeworks/query's
      // useMutation now records the answer where the cache can read it.
      if (typeof event.mutation.options.onError === 'function') return;
      if (callerHandledError(event.mutation.meta)) return;

      // A second failure of the same write replaces the first rather than
      // stacking beside it. Two identical permanent toasts read as two problems.
      if (identity) withdraw(identity);

      const shown = addToast({
        title: meta.writing ? `Couldn't save ${meta.writing}` : "That didn't save",
        description: failure.showReference
          ? `${failure.message} If it keeps happening, quote ${failure.reference}.`
          : failure.message,
        type: 'error',
        // A failed write outlives the glance a toast normally gets. It stays
        // until dismissed, because the whole point is that the screen still
        // shows the change as though it landed.
        timeout: 0,
      });
      if (identity) announcements.current.keep(identity, shown);
    });
  }, [queryClient, addToast]);

  return null;
}
