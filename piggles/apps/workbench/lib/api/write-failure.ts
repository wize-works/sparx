'use client';

// Turning a failed write into a sentence a business owner can act on.
//
// The people using this run a shop, a clinic, a workshop. "422 Unprocessable
// Entity", "NetworkError when attempting to fetch resource" and "RATE_LIMITED"
// are all true and all useless: none of them says whether the thing they typed
// still exists, whether it is their fault, or what to do next. Those three are
// the whole content of a good failure message, and this module is the one place
// that decides them.
//
// The order of the checks is the order of BLAME, not the order of the status
// codes. Offline first, because the commonest failure is not our fault and not
// theirs and needs no apology — just "you're offline". Then the ones they can
// fix. Then ours, which gets a plain admission rather than a euphemism.
//
// One rule earned the hard way: where one OUTCOME has two causes with different
// remedies, it gets two messages. Advice is part of the contract — a sentence
// that sends somebody to fix a connection that was never broken has cost them
// more than saying nothing would have.

import { ApiError } from '@wizeworks/api-client';

export interface WriteFailure {
  /** The sentence shown to the operator. Complete, jargon-free, actionable. */
  readonly message: string;
  /**
   * api-rest's request id, when the failure came back through the envelope.
   * Shown to the operator ONLY for the failures they cannot act on — see
   * `showReference`. It is the one string that ties what they saw to the server
   * log line, which is the difference between "it broke sometimes" and a fix.
   */
  readonly reference?: string;
  /**
   * Whether to put the reference in front of them. True only when the answer is
   * "this is on us" — the person cannot use it for anything else, and printing a
   * hex id under "you're offline" turns an ordinary hiccup into something that
   * looks like it needs reporting.
   */
  readonly showReference: boolean;
  /** For telemetry, never rendered. */
  readonly code: string;
}

/** The browser itself says there is no connection. The one case where "check
 *  your connection" is real advice — so it has to be the browser SAYING SO, not
 *  the absence of an answer.
 *
 *  This read `!navigator.onLine`, which is true both when the browser reports
 *  offline AND when it reports nothing at all: Node ships a global `navigator`
 *  with no `onLine`, and `!undefined` is `true`. Anywhere the property is
 *  missing, every single failed write claimed the connection was down and sent
 *  the reader to fix a network that was never broken — the exact trap the header
 *  rule above describes. An unmeasured value must never render as a measurement
 *  (issue 386). */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * The request never reached us, but the connection is fine.
 *
 * `fetch` rejects with a bare TypeError for a dropped Wi-Fi link, a DNS failure,
 * a refused connection AND a failed CORS preflight — which is what a service
 * returning 503 looks like from the browser. This USED to be folded into
 * "you're offline" on the grounds that the operator cannot tell them apart.
 *
 * They cannot, but the ADVICE differs, and that is what makes it worth telling
 * apart: someone sent to check a connection that was never broken goes and
 * restarts a router, comes back, and finds the same failure. Seen for real —
 * a save came back 503 while the browser was plainly online, and the console
 * told the owner she was not connected to the internet.
 */
function isUnreachable(error: unknown): boolean {
  return error instanceof TypeError;
}

export function describeWriteFailure(error: unknown): WriteFailure {
  if (isOffline()) {
    return {
      message:
        "You're not connected to the internet, so that didn't save. Check your connection and try again — what you typed is still here.",
      showReference: false,
      code: 'offline',
    };
  }

  if (isUnreachable(error)) {
    return {
      message:
        "We couldn't reach Piggles just then, so that didn't save. Your connection looks fine, so this is probably us — wait a moment and save again. What you typed is still here.",
      showReference: false,
      code: 'unreachable',
    };
  }

  if (!(error instanceof ApiError)) {
    return {
      message: "Something went wrong and that didn't save. Please try again.",
      showReference: false,
      code: 'unknown',
    };
  }

  const reference = error.requestId;

  // 401/403 — the session ended, or this person genuinely may not do this. Kept
  // separate because the fixes are opposite: one is "sign in again", the other
  // is "ask whoever runs your account". Guessing wrong sends them to the wrong
  // person, so each says only what it knows.
  if (error.status === 401) {
    return {
      message:
        "You've been signed out, so that didn't save. Sign in again and your work is still here.",
      showReference: false,
      code: 'signed-out',
    };
  }
  if (error.status === 403) {
    return {
      message:
        "You don't have permission to do that, so nothing was changed. Whoever manages your account can give you access.",
      showReference: false,
      code: 'forbidden',
    };
  }

  if (error.status === 404) {
    return {
      message:
        'That no longer exists — someone may have deleted it while you had it open. Nothing was changed.',
      showReference: false,
      code: 'gone',
    };
  }

  // 409 — a REFUSAL. Several different things wear this code and their remedies
  // differ, which is exactly the split this file's header rule exists for
  // (issue 146).
  if (error.status === 409) {
    // A time that got taken while she was filling the form in. Nobody edited
    // anything of hers, and there is usually nothing to reopen — it is a NEW
    // booking. She needs another time, not somebody else's version.
    if (error.code === 'SLOT_UNAVAILABLE') {
      return {
        message:
          'That time was taken while you were filling this in, so nothing was booked. Pick another time and everything else you typed is still here.',
        showReference: false,
        code: 'slot-taken',
      };
    }
    // The record moved on underneath her — confirmed, cancelled, completed by
    // somebody else. Reopening shows where it actually stands.
    if (error.code === 'INVALID_BOOKING_STATE') {
      return {
        message:
          'This has already moved on since you opened it, so nothing was changed. Reopen it to see where it stands now.',
        showReference: false,
        code: 'stale-state',
      };
    }
    // EVERY OTHER 409 IS A REFUSAL, NOT A RACE, and the server has already
    // written the reason in her words: "That domain is already connected to a
    // site", "Verify this domain before making it canonical", "The address that
    // came with this site is its permanent one, so it cannot be removed".
    //
    // This used to answer all of them with "Someone else changed this while you
    // had it open — reopen it to see their version, then make your change
    // again", which is the same trap the header rule describes: a sentence that
    // sends somebody to redo work when the real remedy is to pick a different
    // name. It was wrong on all 56 `conflict()` call sites in api-rest, and it
    // was describing a failure that CANNOT arrive as a 409 — a genuine stale
    // write raises 412 (`assertIfMatch`), handled below (issue 386).
    return {
      message:
        error.message || "That didn't save. Something about it clashes with what is already there.",
      showReference: false,
      code: error.code || 'conflict',
    };
  }

  // 412 — the real "someone else got there first". `assertIfMatch` raises this
  // when the version she had open is not the current one, and its own sentence is
  // written for a developer ("If-Match precondition failed — entry was modified
  // by someone else. Reload before retrying."), so it is replaced rather than
  // passed through. This is the one failure where "try again" is actively wrong
  // advice: retrying would overwrite whatever they did.
  if (error.status === 412) {
    return {
      message:
        'Someone else changed this while you had it open, so it was not saved over. Reopen it to see their version, then make your change again.',
      showReference: false,
      code: 'stale-write',
    };
  }

  if (error.status === 429) {
    return {
      message: 'That was a lot of changes at once. Wait a moment and try again.',
      showReference: false,
      code: 'rate-limited',
    };
  }

  // 400/422 and friends — the server is telling them what is wrong with what
  // they entered, and it is written for them (docs/06 §3). Passing it through is
  // the whole point: "Choose a delivery date that isn't in the past" beats any
  // generic sentence we could substitute.
  //
  // Except VALIDATION_ERROR, where the message is not written for them at all:
  // it is the fixed string "Request validation failed.", and the field paths that
  // would explain it live in `details`. This reporter renders BESIDE a pane's own
  // toast, so leaking it here put the schema's words on screen next to the plain
  // ones — seen on order O-000003 as "Could not write that down · Nothing changed
  // on this order" and "That didn't save · Request validation failed." together.
  if (error.status >= 400 && error.status < 500) {
    const generic = "That didn't save. Check what you entered and try again.";
    return {
      message: error.code === 'VALIDATION_ERROR' ? generic : error.message || generic,
      showReference: false,
      code: error.code || 'rejected',
    };
  }

  // 5xx — ours. Say so plainly: an owner who thinks they broke it goes hunting
  // through their own data for a mistake that was never there.
  return {
    message:
      "Something went wrong on our end, so that didn't save. Nothing you typed was lost — try again in a moment.",
    reference,
    showReference: Boolean(reference),
    code: error.code || 'server-error',
  };
}
