// What to SAY when a write comes back refused, and what a failed READ means.
//
// Eighty-two data modules had written this out by hand, one per app, and the
// wording it produced could be the schema layer describing itself.

import { ApiError } from '@wizeworks/api-client';

/**
 * "There is no such record here" — as opposed to "something went wrong".
 *
 * Nine data modules had declared this identically, so nine surfaces could ask
 * the question and the other hundred could not. It belongs beside the other
 * thing every surface asks of an error.
 */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * WHY a pane has nothing to show, decided from the error rather than assumed.
 *
 * `<PaneLoadError>` has always been able to tell these apart and defaulted to
 * `unreachable`, which is a CLAIM: a 404 came back in milliseconds and the
 * screen said the server could not be reached, over a "Try again" that could
 * only ever fail. Deep-linking a record from another business, opening a saved
 * layout pinned to a deleted one, and following an old bookmark all land here.
 */
export function paneLoadReason(error: unknown): 'missing' | 'unreachable' {
  return isNotFound(error) ? 'missing' : 'unreachable';
}

/**
 * The server's own sentence for a 4xx, or the caller's plain one.
 *
 * Prefer the server's: these routes explain the actual problem — "Cannot cancel
 * an order in status 'delivered'", "Not enough stock to reserve" — far better
 * than anything this side could infer from a status code. A 5xx carries no such
 * sentence, so the caller's wording wins there.
 *
 * Two cases where the server's message is NOT worth showing:
 *
 * The SCHEMA layer reporting on itself. Its message is the fixed string
 * "Request validation failed." and the useful part is in `details`, keyed by
 * field path. Shown to a business owner it explains nothing and reads like
 * their fault, so the caller's fallback wins. Found by recording a payment with
 * a value the enum did not accept: the toast said "Could not write that down ·
 * Request validation failed."
 *
 * An EMPTY message is worse than the fallback for the obvious reason — the toast
 * renders a title and no body. Two of the eighty-two already guarded this; the
 * other eighty did not.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status < 400 || error.status >= 500) return fallback;
  if (schemaReportingOnItself(error)) return fallback;
  return error.message || fallback;
}

/**
 * ONE code, TWO senders — and only one of them is worth repeating.
 *
 * `VALIDATION_ERROR` covers both Zod describing its own failure and a SERVICE
 * deliberately explaining a business rule. Silencing the whole code silenced the
 * second kind too, so "No payment gateway is configured to settle this refund.
 * Refund the customer manually or issue account credit" — the exact sentence the
 * operator needed — reached her as "Check what you entered and try again", about
 * something she had not entered.
 *
 * They are cleanly distinguishable: the schema layer always attaches per-field
 * `details`, and a service never does. The fixed string is checked too, for the
 * one route that sends Fastify's own validation message.
 */
function schemaReportingOnItself(error: ApiError): boolean {
  if (error.code !== 'VALIDATION_ERROR') return false;
  if (Array.isArray(error.details) && error.details.length > 0) return true;
  return error.message === 'Request validation failed.';
}
