// Weak ETag derivation for ContentEntry.
//
// We don't hash the full body — `updatedAt` already advances on every PATCH
// (see entries.ts which sets it explicitly), so a tag of `{id}:{ms}` is
// uniquely identifying and cheap to compute. Marked weak (`W/`) because two
// distinct response payloads can still share the underlying entry version
// (e.g. preview-token-decorated response).
//
// Pattern: GET sets `ETag`. PATCH that supplies `If-Match` is validated
// against the current row's tag inside the same transaction that performs
// the update, so the read + check + write happen with no race window.

import { preconditionFailed } from '../errors.js';

export function computeEntryEtag(entry: { id: string; updatedAt: Date }): string {
  return `W/"${entry.id}.${entry.updatedAt.getTime().toString(36)}"`;
}

// Parses an `If-Match: W/"foo", W/"bar"` header and returns true if any
// tag matches `currentTag`. `*` is the RFC 7232 wildcard ("any
// representation") — for an existing row this always matches.
export function ifMatchSatisfied(headerValue: string | undefined, currentTag: string): boolean {
  if (!headerValue) return true; // Header absent → no precondition.
  const trimmed = headerValue.trim();
  if (trimmed === '*') return true;
  const tags = trimmed.split(',').map((t) => t.trim());
  return tags.some((t) => t === currentTag);
}

export function assertIfMatch(headerValue: string | undefined, currentTag: string): void {
  if (!ifMatchSatisfied(headerValue, currentTag)) {
    throw preconditionFailed(
      'If-Match precondition failed — entry was modified by someone else. Reload before retrying.',
      { currentETag: currentTag }
    );
  }
}
