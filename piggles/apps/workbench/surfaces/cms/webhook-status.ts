'use client';

// What a notification's state MEANS, in an owner's words.
//
// `active` is a SETTING. It used to be reported as a RESULT — "Notifications are
// being sent to this address as events happen" beside a green badge — whether or
// not a single message had ever arrived, so a mistyped address read exactly like
// a working one (issue 403).
//
// Every branch below exists because it is a DIFFERENT fact, and the ladder is
// ordered worst-news-first. The one that is easiest to get wrong is `pending`:
// a queued message is not a delivered one, and the first cut of this file said
// "Working. 0 messages arrived." on a notification that had reached nobody.

import type { WebhookDelivery, WebhookHealth } from './webhooks-data';

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface WebhookStateLabel {
  label: string;
  tone: Tone;
  detail: string;
}

const PAUSED: WebhookStateLabel = {
  label: 'Paused',
  tone: 'warning',
  detail: 'No notifications are being sent. Turn it back on whenever you like.',
};

/** Switched on, but nothing has been TRIED yet. Never "working". */
const NOTHING_SENT: WebhookStateLabel = {
  label: 'Nothing sent yet',
  tone: 'info',
  detail:
    'This is switched on, but none of the events you picked has happened yet, so we have had nothing to send. Once one does, you will see it here.',
};

export function webhookState(active: boolean, health?: WebhookHealth): WebhookStateLabel {
  if (!active) return PAUSED;
  if (health === undefined) return NOTHING_SENT;
  if (health.lastOutcome === null) return NOTHING_SENT;

  const window = String(health.windowDays);

  if (health.failed > 0 && health.delivered === 0) {
    return {
      label: 'Not getting through',
      tone: 'error',
      detail: `We tried ${messages(health.failed)} and none of them arrived. Check the address is right, and that whoever runs it is expecting us.`,
    };
  }
  if (health.failed > 0) {
    return {
      label: 'Some are failing',
      tone: 'warning',
      detail: `${messages(health.delivered)} arrived, ${String(health.failed)} did not. Worth asking whoever runs that address to look.`,
    };
  }
  if (health.delivered > 0) {
    return {
      label: 'Working',
      tone: 'success',
      detail: `${messages(health.delivered)} arrived in the last ${window} days. Nothing has failed.`,
    };
  }
  if (health.pending > 0) {
    return {
      label: 'On its way',
      tone: 'info',
      detail: `${messages(health.pending)} on the way. We will show whether it arrived as soon as we know.`,
    };
  }
  // Something happened once, but not inside the window we count.
  return {
    label: 'Quiet lately',
    tone: 'info',
    detail: `Nothing has been sent in the last ${window} days. The last message we sent ${lastEnding(health.lastOutcome)}.`,
  };
}

function lastEnding(outcome: Exclude<WebhookHealth['lastOutcome'], null>): string {
  if (outcome === 'delivered') return 'arrived safely';
  if (outcome === 'failed') return 'never arrived';
  return 'was still on its way';
}

function messages(n: number): string {
  return n === 1 ? '1 message' : `${String(n)} messages`;
}

/** What one attempt says on its own row. */
export function deliveryState(delivery: WebhookDelivery): { label: string; tone: Tone } {
  if (delivery.status === 'delivered') return { label: 'Arrived', tone: 'success' };
  if (delivery.status === 'failed') return { label: 'Never arrived', tone: 'error' };
  return { label: 'Still trying', tone: 'warning' };
}
