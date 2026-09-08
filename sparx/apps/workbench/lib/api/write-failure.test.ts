// What a failed write SAYS, which is the only part of it a shop owner sees.
//
// WHY THIS EXISTS. The module had no tests, and the one thing it exists to get
// right had been backwards since it was written: every 409 was answered with
// "Someone else changed this while you had it open — reopen it to see their
// version, then make your change again."
//
// A 409 from api-rest is a REFUSAL, raised by `conflict()`, and its message is
// already written for the reader: "That domain is already connected to a site",
// "Verify this domain before making it canonical". There are 56 of them, and all
// 56 had their explanation replaced with advice to go and redo work that would
// not have helped. Meanwhile a genuine stale write raises 412 (`assertIfMatch`)
// and fell through to the generic branch, putting "If-Match precondition failed"
// on the screen (issue 386).
//
// The rule these assert is the file's own header rule: where one OUTCOME has two
// causes with different remedies, it gets two messages — and the message has to
// carry the remedy that actually works.

import { describe, expect, it } from 'vitest';
import { ApiError } from '@wizeworks/api-client';
import { describeWriteFailure } from './write-failure';

/** An api-rest failure as the client sees it. */
function apiError(status: number, code: string, message: string): ApiError {
  return new ApiError(status, {
    success: false,
    error: { code, message, request_id: 'req_test', details: undefined },
  });
}

describe('a 409 is a refusal, and the server already explained it', () => {
  it('shows the reason rather than talking about somebody else', () => {
    const failure = describeWriteFailure(
      apiError(409, 'CONFLICT', 'That domain is already connected to a site.')
    );

    expect(failure.message).toBe('That domain is already connected to a site.');
    // The sentence that used to replace it, and the word that made it wrong.
    expect(failure.message).not.toContain('Someone else');
    expect(failure.message).not.toContain('Reopen it');
  });

  it('carries the cross-site label clash through verbatim', () => {
    // The exact refusal a shop owner meets when she names a tag on one site that
    // another of her sites already uses — a clash she cannot see from where she
    // is standing, so the sentence naming the other site is the whole value.
    const message =
      '“Craft” on Juniper Row Sample Sale already uses the web address “craft”, and a label’s address has to be unique across your whole business. Give this one a different one.';
    expect(describeWriteFailure(apiError(409, 'CONFLICT', message)).message).toBe(message);
  });

  it('falls back to a plain sentence when the server sent no words', () => {
    const failure = describeWriteFailure(apiError(409, 'CONFLICT', ''));
    expect(failure.message).toContain('clashes with what is already there');
  });

  it('still separates a taken booking slot, which is a refusal with its own remedy', () => {
    const failure = describeWriteFailure(apiError(409, 'SLOT_UNAVAILABLE', 'Slot unavailable.'));
    expect(failure.code).toBe('slot-taken');
    expect(failure.message).toContain('Pick another time');
  });

  it('still separates a booking that moved on', () => {
    const failure = describeWriteFailure(apiError(409, 'INVALID_BOOKING_STATE', 'Invalid state.'));
    expect(failure.code).toBe('stale-state');
    expect(failure.message).toContain('Reopen it to see where it stands now');
  });
});

describe('a 412 is the real "somebody else got there first"', () => {
  it("says so in her words, not the header's", () => {
    const failure = describeWriteFailure(
      apiError(
        412,
        'PRECONDITION_FAILED',
        'If-Match precondition failed — entry was modified by someone else. Reload before retrying.'
      )
    );

    expect(failure.code).toBe('stale-write');
    expect(failure.message).toContain('Someone else changed this while you had it open');
    // The server's own sentence is written for a developer and must not reach her.
    expect(failure.message).not.toContain('If-Match');
    expect(failure.message).not.toContain('precondition');
  });

  it("never asks her to report it — this one is nobody's fault and hers to redo", () => {
    const failure = describeWriteFailure(apiError(412, 'PRECONDITION_FAILED', 'x'));
    expect(failure.showReference).toBe(false);
  });
});

describe('"you are offline" needs the browser to have SAID so', () => {
  const setOnLine = (value: boolean | undefined): void => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value,
      configurable: true,
      writable: true,
    });
  };

  it('does not claim the connection is down when the browser never answered', () => {
    // Node's global `navigator` has no `onLine`, and the guard read
    // `!navigator.onLine` — so `!undefined` made EVERY failed write say the
    // internet was gone. An unmeasured value must not render as a measurement.
    setOnLine(undefined);
    const failure = describeWriteFailure(
      apiError(409, 'CONFLICT', 'That domain is already connected to a site.')
    );
    expect(failure.message).toBe('That domain is already connected to a site.');
    expect(failure.code).not.toBe('offline');
  });

  it('still says so when the browser really does report offline', () => {
    setOnLine(false);
    try {
      const failure = describeWriteFailure(apiError(409, 'CONFLICT', 'anything'));
      expect(failure.code).toBe('offline');
      expect(failure.message).toContain('Check your connection');
    } finally {
      setOnLine(undefined);
    }
  });
});

describe('the ordinary rejections are unchanged', () => {
  it('passes a 400 through, because it was written for her', () => {
    const failure = describeWriteFailure(
      apiError(400, 'BAD_REQUEST', "Choose a delivery date that isn't in the past.")
    );
    expect(failure.message).toBe("Choose a delivery date that isn't in the past.");
  });

  it('swallows VALIDATION_ERROR, whose message is the schema talking', () => {
    const failure = describeWriteFailure(
      apiError(422, 'VALIDATION_ERROR', 'Request validation failed.')
    );
    expect(failure.message).not.toContain('Request validation failed');
    expect(failure.message).toContain('Check what you entered');
  });

  it('admits a 500 is ours and hands over the reference', () => {
    const failure = describeWriteFailure(apiError(500, 'INTERNAL', 'boom'));
    expect(failure.showReference).toBe(true);
    expect(failure.reference).toBe('req_test');
  });
});
