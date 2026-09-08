// What is currently announced about a failed write.

// The failure message a watcher put on screen never dismisses itself, by design
// — the screen still shows the change as though it landed, so the apology has to
// outlast a glance. The cost is a message that can go stale: the retry succeeds
// and "that didn't save" is still sitting beside "saved", with nothing to say
// which one is current. So whoever shows one has to be able to take it back.
//
// Keyed by `writeIdentity`, because a failure and the retry that fixed it are
// two different mutations from one hook. Weak, so a closed pane's entry goes
// with it rather than pinning a dead hook for the life of the session.
//
// Lives here rather than in a console because both consoles' reporters need it
// and neither owns the other. The token is an opaque string — this knows nothing
// about toasts.

export interface WriteAnnouncements {
  /**
   * Take back what is on screen for this write, and say what to close.
   *
   * Undefined means nothing was showing, which is the normal case — most writes
   * succeed the first time and never announce anything.
   */
  take(identity: object | undefined): string | undefined;
  /** Record the message now on screen for this write. */
  keep(identity: object | undefined, toastId: string): void;
}

export function createWriteAnnouncements(): WriteAnnouncements {
  const shown = new WeakMap<object, string>();
  return {
    take(identity) {
      // An unidentified write is one that never went through our `useMutation`.
      // It gets no bookkeeping rather than a shared fallback key, which two
      // unrelated writes would use to close each other's messages.
      if (!identity) return undefined;
      const toastId = shown.get(identity);
      if (toastId === undefined) return undefined;
      shown.delete(identity);
      return toastId;
    },
    keep(identity, toastId) {
      if (!identity) return;
      shown.set(identity, toastId);
    },
  };
}
