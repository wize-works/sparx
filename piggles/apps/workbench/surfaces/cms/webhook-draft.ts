'use client';

// The editable shape behind both the set-up and the manage view.
//
// `url` is held exactly as typed, not as it will be saved. `checkAddress` is
// what turns one into the other, at the moment of saving and on leaving the
// field, so nothing is ever stored that the person did not see.

import { checkAddress } from './webhook-address';

export interface WebhookDraft {
  name: string;
  url: string;
  events: Set<string>;
  active: boolean;
}

export function emptyDraft(): WebhookDraft {
  return { name: '', url: '', events: new Set<string>(), active: true };
}

export function serializeDraft(draft: WebhookDraft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    url: draft.url.trim(),
    events: [...draft.events].sort(),
    active: draft.active,
  });
}

/**
 * Why this draft cannot be saved yet, or null.
 *
 * ONE sentence, so the button's tooltip and the field's own message can never
 * disagree. Order matters: the missing things come before the malformed ones,
 * because "you have not typed an address" is more useful than "that is not a
 * web address" when the box is empty.
 */
/** The server's own limit (`z.string().max(120)`). Checked here as well as at
 *  the field, because a paste can land past the field's `maxLength`. */
const NAME_MAX = 120;

export function draftProblem(draft: WebhookDraft): string | null {
  const name = draft.name.trim();
  if (name === '') return 'Give this a short name so you can recognise it later.';
  if (name.length > NAME_MAX) {
    return `That name is too long. Shorten it to ${String(NAME_MAX)} characters or fewer.`;
  }
  const address = checkAddress(draft.url);
  if (!address.ok) return address.reason;
  if (draft.events.size === 0) {
    return 'Tick at least one thing to be notified about.';
  }
  return null;
}
