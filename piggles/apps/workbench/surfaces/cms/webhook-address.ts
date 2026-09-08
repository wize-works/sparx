// Reading the address somebody typed, the way they meant it.
//
// The server takes `z.string().url()` and answers a bad one with Zod's own
// report, which `apiErrorMessage` correctly refuses to show — so a shop owner
// who typed `stock.example.co.uk/hooks`, exactly as anyone says a web address
// out loud, pressed Create and got "Could not create this webhook. Nothing was
// saved." The rule she had broken was sitting in grey text under the box, and
// nothing pointed at it (issue 405).
//
// Two jobs, in this order:
//
//   TIDY   A missing `https://` is not a mistake, it is how people write
//          addresses. We add it, visibly, so what she sees is what we save.
//   REFUSE Everything left, in a sentence that names the problem and the fix.

export type AddressCheck =
  { ok: true; url: string; tidied: boolean } | { ok: false; reason: string };

/** A scheme at the very start. The `//` is required: without it `localhost:4000`
 *  reads as the scheme "localhost", and a developer pointing this at their own
 *  machine gets told it is not a web address. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** A hostname worth trying: at least one dot, or plain `localhost`. */
function plausibleHost(host: string): boolean {
  if (host === 'localhost') return true;
  if (!host.includes('.')) return false;
  return !host.startsWith('.') && !host.endsWith('.');
}

/**
 * The address as it will be saved, or why it cannot be.
 *
 * `tidied` says we changed what was typed, so the field can show the result
 * rather than saving something the person never saw.
 */
export function checkAddress(raw: string): AddressCheck {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'Add the web address the notifications should go to.' };
  }

  if (/^http:\/\//i.test(trimmed)) {
    return {
      ok: false,
      reason:
        'Notifications are only sent to a secure address. Change http:// at the start to https://.',
    };
  }

  if (SCHEME.test(trimmed) && !/^https:\/\//i.test(trimmed)) {
    return {
      ok: false,
      reason: 'This has to be a web address starting with https://.',
    };
  }

  const tidied = !SCHEME.test(trimmed);
  const candidate = tidied ? `https://${trimmed}` : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      ok: false,
      reason:
        'That does not look like a web address. It should look like https://example.com/updates.',
    };
  }

  if (!plausibleHost(parsed.hostname)) {
    return {
      ok: false,
      reason:
        'That does not look like a web address. It should look like https://example.com/updates.',
    };
  }

  if (candidate.length > 2048) {
    return { ok: false, reason: 'That address is too long. Keep it under 2048 characters.' };
  }

  return { ok: true, url: parsed.toString(), tidied };
}
