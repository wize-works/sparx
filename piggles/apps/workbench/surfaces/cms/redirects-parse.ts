'use client';

// Turning a pasted list into rows you can check before importing.
//
// Split from `redirects-format.ts` under RULE #0.5 once the parse learned two
// facts about the business: which web addresses are hers, and which old
// addresses already have a rule. Both are what stop the preview promising
// something the server will refuse.

import { normalizePath, type RedirectStatusCode } from './redirects-format';

/** What the preview says about one line. */
export type RedirectRowState =
  /** Good to go. */
  | 'ready'
  /** She has to change something before this line can be imported. */
  | 'fix'
  /** Nothing wrong with it; it just will not be imported, and she should know. */
  | 'already';

/** One parsed line of a pasted import, ready to preview before it is sent. */
export interface ParsedRedirectRow {
  /** 1-based line number in the pasted text, for pointing at the problem. */
  line: number;
  from: string;
  to: string;
  statusCode: RedirectStatusCode;
  state: RedirectRowState;
  /** Why, in her words. Null when the row is simply ready. */
  message: string | null;
}

/** What the parse is allowed to know about the business. */
export interface RedirectParseContext {
  /** Every web address this business has connected, lowercased. A pasted full
   *  URL on one of them is read as the path; on anything else it is refused,
   *  because a redirect can only fire on an address her site answers on. */
  ownHosts?: readonly string[];
  /** Old address → where it already goes. Rules she already has. */
  existing?: ReadonlyMap<string, string>;
}

/** Read a type hint from a third column: a word or a raw code, else Permanent. */
function statusFromHint(hint: string | undefined): RedirectStatusCode {
  const value = (hint ?? '').trim().toLowerCase();
  if (value === 'temporary' || value === 'temp' || value === '302' || value === '307') return 302;
  return 301;
}

/** The host in a pasted value, or '' when there is none. Handles both a full
 *  URL and the bare `example.com/page` a spreadsheet often holds. */
function hostOf(value: string): string {
  const withoutScheme = value.replace(/^[a-z]+:\/\//i, '');
  if (withoutScheme === value && !value.includes('.')) return '';
  const firstSegment = (withoutScheme.split('/')[0] ?? '').toLowerCase();
  return firstSegment.includes('.') ? (firstSegment.split(':')[0] ?? '') : '';
}

/** The path part of a pasted value that carried a host. */
function pathOf(value: string): string {
  const withoutScheme = value.replace(/^[a-z]+:\/\//i, '');
  const slash = withoutScheme.indexOf('/');
  return slash === -1 ? '/' : withoutScheme.slice(slash);
}

interface Resolved {
  path: string;
  /** The host that could not be accepted, when there is one. */
  foreignHost: string | null;
}

/**
 * A pasted address as a path on her site.
 *
 * A full web address is what every crawler and search-console export gives, so
 * refusing one outright made the commonest real input the wrong input. It is
 * accepted when its host is one she has connected — which is also the only case
 * where the rule could ever fire, since a redirect runs on the addresses her
 * site answers on and nowhere else.
 */
function resolveAddress(raw: string, ownHosts: readonly string[]): Resolved {
  const value = raw.trim();
  if (value === '') return { path: '', foreignHost: null };
  const host = hostOf(value);
  if (host === '') return { path: normalizePath(value), foreignHost: null };
  if (ownHosts.includes(host)) return { path: pathOf(value), foreignHost: null };
  return { path: value, foreignHost: host };
}

/** Split one line into its columns: a tab or comma, else an arrow, else spaces. */
function columnsOf(raw: string): string[] {
  if (raw.includes('\t')) return raw.split('\t');
  if (raw.includes(',')) return raw.split(',');
  if (raw.includes('→') || raw.includes('->')) return raw.split(/→|->/);
  return raw.trim().split(/\s+/);
}

/** What is wrong with a row, or null. Kept apart from the loop so each answer
 *  reads as one sentence about one situation. */
function judge(
  from: Resolved,
  to: Resolved,
  seen: Map<string, number>,
  existing: ReadonlyMap<string, string>
): { state: RedirectRowState; message: string | null } {
  const foreign = from.foreignHost ?? to.foreignHost;
  if (foreign !== null) {
    return {
      state: 'fix',
      message: `${foreign} is not one of your web addresses. Paste just the part after it, like /about-us.`,
    };
  }
  if (from.path === '' || to.path === '') {
    return { state: 'fix', message: 'Give both an old address and where it should go.' };
  }
  if (!from.path.startsWith('/') || !to.path.startsWith('/')) {
    return {
      state: 'fix',
      message: 'Both addresses must be a path on your site, starting with a slash.',
    };
  }
  if (from.path === to.path) {
    return { state: 'fix', message: 'The old and new addresses are the same.' };
  }
  const earlier = seen.get(from.path);
  if (earlier !== undefined) {
    return {
      state: 'already',
      message: `Line ${String(earlier)} already moves this address. That one will be used.`,
    };
  }
  const current = existing.get(from.path);
  if (current !== undefined) {
    return {
      state: 'already',
      message: `Already moved — it goes to ${current}. Change it on the Old links screen.`,
    };
  }
  return { state: 'ready', message: null };
}

/**
 * Turn pasted text into preview rows.
 *
 * One redirect per line, "old, new" — a comma, a tab (what a spreadsheet paste
 * gives), or an arrow between them, with an optional third column saying
 * permanent or temporary. Blank lines are ignored so a padded paste is fine.
 * Every row is judged here so the preview shows exactly what will and will not
 * import BEFORE anything is sent.
 */
export function parseRedirectRows(
  text: string,
  context: RedirectParseContext = {}
): ParsedRedirectRow[] {
  const ownHosts = context.ownHosts ?? [];
  const existing = context.existing ?? new Map<string, string>();
  const rows: ParsedRedirectRow[] = [];
  const seen = new Map<string, number>();
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '') continue;

    const parts = columnsOf(raw);
    const from = resolveAddress(parts[0] ?? '', ownHosts);
    const to = resolveAddress(parts[1] ?? '', ownHosts);
    const verdict = judge(from, to, seen, existing);
    if (verdict.state === 'ready') seen.set(from.path, i + 1);

    rows.push({
      line: i + 1,
      from: from.path,
      to: to.path,
      statusCode: statusFromHint(parts[2]),
      state: verdict.state,
      message: verdict.message,
    });
  }

  return rows;
}
