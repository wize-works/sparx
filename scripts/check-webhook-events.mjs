// Fails if the three lists that decide which events a tenant can subscribe to
// have drifted apart.
//
// There are THREE, and each failure between them is silent in a different way:
//
//   1. `EVENT_KEYS` in wizeworks/services/api-rest/.../webhooks/subscriptions.ts
//      The allow-list the API validates against. A key missing here is rejected
//      at save time with a validation error naming no cause.
//   2. The event catalogue in EVERY brand's workbench, under
//      `<brand>/apps/workbench/surfaces/cms/` — either `webhooks-data.ts` or a
//      `webhook-events/` directory.
//      The human catalogue the picker renders. A key missing here is
//      subscribable only by someone hand-writing JSON against the API — so the
//      feature exists and nobody can find it.
//
//      THERE ARE TWO OF THESE, and for a long time this file named one. sparx
//      and Piggles ship separate consoles with separate pickers, so a key added
//      to the API and to sparx's list passed the check while Piggles' shop
//      owners simply could not see it — the exact silent divergence the check
//      exists to catch, unable to catch itself. The list is now DISCOVERED
//      rather than typed, and the discovery asserts it found more than one:
//      a check that hard-codes a path is one rename away from scanning nothing
//      and printing green.
//   3. `EventType` in wizeworks/packages/events/src/types.ts
//      The event registry. A key allowed in (1) that is not in (3) can never
//      fire, because nothing will ever publish it.
//
// The worst of the three is (1)+(2) agreeing on an event that (3) does not
// emit: the subscription saves, the picker shows it ticked, and the endpoint
// stays silent forever. Whoever set it up concludes their server is broken.
// `inventory.levels.updated` is exactly this shape — declared in the registry,
// published by nothing — which is why it is absent from (1) and (2) and why
// this check exists.
//
// Zero dependencies on purpose: the CI job runs it with bare Node, no install.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

const ROUTE = 'wizeworks/services/api-rest/src/routes/v1/webhooks/subscriptions.ts';
const REGISTRY = 'wizeworks/packages/events/src/types.ts';
const CMS_DIR = 'apps/workbench/surfaces/cms';

/**
 * Every brand console that renders an event picker.
 *
 * Two shapes, because one console outgrew 250 lines of catalogue and split it:
 * a single `webhooks-data.ts` declaring WEBHOOK_EVENTS, or a `webhook-events/`
 * directory of files declaring pieces of it. Both are read the same way — every
 * `key: '…'` line — so neither shape can hide an entry.
 *
 * Found by looking, not by listing: a third brand gets checked the day it
 * exists. The floor of two is the guard — one catalogue means a directory moved
 * and this check quietly stopped covering the other console.
 */
function catalogSources() {
  const found = [];
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = `${entry.name}/${CMS_DIR}/webhook-events`;
    const file = `${entry.name}/${CMS_DIR}/webhooks-data.ts`;
    if (existsSync(join(repoRoot, dir))) {
      const files = readdirSync(join(repoRoot, dir))
        .filter((name) => name.endsWith('.ts'))
        .map((name) => `${dir}/${name}`);
      found.push({ brand: entry.name, label: `${dir}/`, files });
      continue;
    }
    if (existsSync(join(repoRoot, file))) {
      found.push({ brand: entry.name, label: file, files: [file] });
    }
  }
  if (found.length < 2) {
    throw new Error(
      `check-webhook-events: found ${found.length} event picker(s) under */${CMS_DIR} — expected one per brand console. A moved directory makes this check scan nothing and pass.`
    );
  }
  return found;
}

/**
 * Entries in a list block, read LINE BY LINE and never from comments.
 *
 * Same hazard `registryKeys` documents below, and it was left in these two: an
 * ordinary apostrophe in a prose comment — "the storefront's cache" — opens a
 * string as far as `matchAll(/'([^']+)'/g)` is concerned, and everything up to
 * the next apostrophe is swallowed. One such comment dropped this reader from 36
 * keys to 16 and then reported the twenty survivors as missing from a catalogue
 * they were already in, which sends a maintainer after a fault that is not
 * there. Skipping `//` lines is the whole fix.
 */
function listKeys(block, pattern, label) {
  const keys = new Set();
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    const hit = pattern.exec(trimmed);
    if (hit) keys.add(hit[1]);
  }
  if (keys.size === 0) throw new Error(`check-webhook-events: ${label} parsed as empty`);
  return keys;
}

/** The `const EVENT_KEYS = [ … ] as const` block in the route. */
function routeKeys() {
  const source = read(ROUTE);
  const block = /const EVENT_KEYS = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) throw new Error(`check-webhook-events: EVENT_KEYS not found in ${ROUTE}`);
  return listKeys(block[1], /^'([^']+)',?$/, 'EVENT_KEYS');
}

/**
 * Every catalogued key in one console.
 *
 * Read as `key: '…'` lines across the console's catalogue file(s) rather than by
 * matching one array literal: the split console declares three arrays, and a
 * regex anchored on a single `WEBHOOK_EVENTS = [ … ]` would have found the index
 * file's spread of them and reported ZERO catalogued events — a check that fails
 * for the wrong reason is as useless as one that passes for the wrong reason.
 */
function catalogKeys(source) {
  const keys = new Set();
  for (const rel of source.files) {
    for (const line of read(rel).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const hit = /^key: '([^']+)',/.exec(trimmed);
      if (hit) keys.add(hit[1]);
    }
  }
  if (keys.size === 0) {
    throw new Error(`check-webhook-events: no catalogued events found in ${source.label}`);
  }
  return keys;
}

/**
 * Every member of the EventType union.
 *
 * Read line-by-line rather than with one span regex: the union is heavily
 * commented, and those comments contain both semicolons and quoted words
 * ("Sam's workspace"), so terminating on `;` or harvesting every quoted string
 * both give a wrong answer — the first found six members out of two hundred.
 * Only lines whose first non-space character is `|` count.
 */
function registryKeys() {
  const lines = read(REGISTRY).split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith('export type EventType ='));
  if (start === -1) throw new Error(`check-webhook-events: EventType not found in ${REGISTRY}`);

  const keys = new Set();
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    // The next top-level declaration ends the union.
    if (trimmed.startsWith('export ')) break;
    if (!trimmed.startsWith('|')) continue;
    const literal = /^\|\s*'([^']+)'/.exec(trimmed);
    if (literal) keys.add(literal[1]);
  }
  if (keys.size === 0) throw new Error(`check-webhook-events: EventType union parsed as empty`);
  return keys;
}

const route = routeKeys();
const registry = registryKeys();
const catalogs = catalogSources().map((source) => ({
  brand: source.brand,
  rel: source.label,
  keys: catalogKeys(source),
}));

const problems = [];

for (const key of route) {
  for (const { rel, keys } of catalogs) {
    if (keys.has(key)) continue;
    problems.push(
      `${key}: allowed by the API but missing from one picker — subscribable there only by hand-writing JSON.\n    add it to WEBHOOK_EVENTS in ${rel}`
    );
  }
  if (!registry.has(key)) {
    problems.push(
      `${key}: allowed by the API but not a real EventType — a subscription to it can never fire.\n    add it to EventType in ${REGISTRY}, or remove it from EVENT_KEYS in ${ROUTE}`
    );
  }
}

for (const { rel, keys } of catalogs) {
  for (const key of keys) {
    if (route.has(key)) continue;
    problems.push(
      `${key}: offered in the picker at ${rel} but rejected by the API — ticking it fails to save.\n    add it to EVENT_KEYS in ${ROUTE}`
    );
  }
}

// The denominator, printed either way: a count is the only thing that shows
// this check is still looking at as much as it used to.
const scope = `${route.size} allowed keys, ${catalogs.length} pickers (${catalogs
  .map((c) => `${c.brand}:${c.keys.size}`)
  .join(', ')}), ${registry.size} declared events`;

if (problems.length > 0) {
  console.error('\nWebhook event lists have drifted:\n');
  for (const problem of problems) console.error(`  - ${problem}\n`);
  console.error(`Checked ${scope}.\n`);
  process.exit(1);
}

console.log(`check-webhook-events: ok — ${scope}; every picker carries every allowed event.`);
