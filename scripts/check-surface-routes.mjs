// Fails if a workbench surface has no address, or an address names a surface
// that does not exist.
//
// WHY THIS IS A SCRIPT AND NOT A TEST. The invariant spans two things that
// cannot meet at runtime: the route table in `@wizeworks/links` (pure data, imported
// by Node services) and the surface registry in sparx/apps/workbench (which imports
// React, silicaui, and all 233 pane components). A vitest that imported the
// registry would drag the entire UI into a data check. Both sides declare their
// keys as string literals, so reading the literals is both sufficient and
// immune to the import graph.
//
// The two failure directions are NOT symmetrical, and both matter:
//
//   • A surface with no route is a pane nobody can link to. Silent — it simply
//     never appears in a shared link, and the address bar falls back to `/`
//     whenever it is focused. This is the direction that rots as surfaces get
//     added, which is the whole reason this check exists.
//   • A route with no surface is a link that opens nothing. Loud for whoever
//     clicks it, invisible to whoever sent it — this is exactly how
//     `/?surface=social.composer` survived in production email for months.
//
// Zero dependencies on purpose: CI runs it with bare Node, no install.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// BOTH consoles, because both address their panes out of the one route table.
//
// It scanned sparx's catalog alone for a long time, and piggles' own studio panes —
// its page, header, look, saved-piece, history and preview builders — went six phases
// with no address at all. Nothing failed: an unaddressed pane just falls back to `/`,
// so the bar goes blank when you focus it and a link to a page editor cannot be sent.
// A check that covers one of two apps reads exactly like a check that covers both.
const CATALOG_DIRS = [
  'sparx/apps/workbench/lib/surfaces/catalog',
  'piggles/apps/workbench/lib/surfaces/catalog',
];
const ROUTES_FILE = 'wizeworks/packages/links/src/routes.ts';

// Registrations that live OUTSIDE the catalog directories. `piggles.home` is one:
// its own file, because it is the Piggles console's answer to "what do I look at
// first" and deliberately not sparx's `workbench.home`. A registry read that
// misses it reports a key nothing registers, which is worse than not checking.
const EXTRA_REGISTRY_FILES = ['piggles/apps/workbench/lib/surfaces/piggles-catalog.ts'];

// Where a surface is OPENED from. Both consoles, same reason as CATALOG_DIRS.
const SURFACE_ROOTS = ['sparx/apps/workbench', 'piggles/apps/workbench'];

// A surface key: lowercase segments, at least one dot. Tight on purpose — the
// scan reads every `.open('…')` in both apps, and `window.open('/pricing')` or
// `dialog.open('confirm')` must not be mistaken for one.
const SURFACE_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/;

// Surfaces knowingly without an address, each with the issue that will give it one.
// NOT a way to make the check quiet: anything not listed here still fails, so a new
// unaddressed surface is caught the day it lands.
//
// EMPTY, and it should stay that way. `piggles.home` was the one entry: both consoles
// read ONE route table, `/home` already belonged to sparx's `workbench.home`, and the
// Piggles console's Home had no address at all (issue 328). The table can now say which
// product a path is for, so both front doors are `/home` and the entry is gone.
const NO_ADDRESS_YET = new Set([]);

// Dead `open()` calls that already existed when this direction was first checked
// (2026-08-29, issue 327).
//
// EMPTY, and it should stay that way. All five were sparx's, and all five were the
// ORIGINALS: the Piggles console was copied from that tree in August and inherited
// every one of them. Piggles' copies were fixed first; the sparx originals were the
// same three typos (`commerce.products.detail` for `commerce.product.detail`,
// `crm.orders.detail` for `commerce.order.detail`, `inventory.stock.detail` for
// `inventory.stock.item`) and are now fixed too, so the list is gone rather than
// re-recorded at new line numbers. Add an entry only with a reason nobody can act on
// today — never to make this quiet.
const KNOWN_DEAD_OPENS = new Set([]);

/** Strip `//` line comments so a key quoted inside prose is not read as a declaration. */
function decomment(source) {
  return source
    .split('\n')
    .map((line) => {
      const marker = line.indexOf('//');
      return marker === -1 ? line : line.slice(0, marker);
    })
    .join('\n');
}

function collect(source, pattern) {
  const found = new Set();
  for (const match of decomment(source).matchAll(pattern)) found.add(match[1]);
  return found;
}

/** A path that must exist. A scan root that quietly went missing prints green over
 *  nothing, which is the failure mode this whole file exists to prevent. */
function mustExist(path) {
  const full = join(repoRoot, path);
  if (!existsSync(full)) {
    console.error(
      `check-surface-routes: '${path}' does not exist. A scan root moved; fix this script before trusting it.`
    );
    process.exit(1);
  }
  return full;
}

/** Every .ts/.tsx file under a directory. */
function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(full);
  }
  return found;
}

// --- Registered surfaces ----------------------------------------------------
// The UNION of both catalogs. A key either console registers must be addressable,
// and a route either console can serve is not orphaned.
const surfaces = new Set();
for (const dir of CATALOG_DIRS) {
  const full = mustExist(dir);
  for (const file of readdirSync(full)) {
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(join(full, file), 'utf8');
    for (const key of collect(source, /\bkey:\s*'([^']+)'/g)) surfaces.add(key);
  }
}
for (const file of EXTRA_REGISTRY_FILES) {
  const source = readFileSync(mustExist(file), 'utf8');
  for (const key of collect(source, /\bkey:\s*'([^']+)'/g)) surfaces.add(key);
}

// --- Addressed surfaces -----------------------------------------------------
const routed = collect(
  readFileSync(join(repoRoot, ROUTES_FILE), 'utf8'),
  /\bsurface:\s*'([^']+)'/g
);

if (surfaces.size === 0 || routed.size === 0) {
  console.error(
    `check-surface-routes: read ${surfaces.size} surfaces and ${routed.size} routes — one of the two files changed shape. Fix this script before trusting it.`
  );
  process.exit(1);
}

// --- Opened surfaces --------------------------------------------------------
// THE THIRD DIRECTION, and the one that bites hardest. `controller.open()` returns
// null for a key nothing registers — no throw, no warning, no toast — so a button
// wired to a renamed key does NOTHING, looks exactly like a working button, and
// survives typecheck, lint and every test. Eleven of them had accumulated across
// the Piggles console by issue 327: five still naming `builder.studio` months after
// that pane was split into one per document, three the plural
// `commerce.products.detail`, and the "Start here" on the empty-workbench screen
// opening sparx's home from inside Piggles.
const opened = [];
let scanned = 0;
for (const root of SURFACE_ROOTS) {
  for (const file of sourceFiles(mustExist(root))) {
    scanned += 1;
    const source = decomment(readFileSync(file, 'utf8'));
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/\.open\(\s*'([^']+)'/g)) {
        const key = match[1];
        if (!SURFACE_KEY.test(key)) continue;
        opened.push({ key, where: `${relative(repoRoot, file).replace(/\\/g, '/')}:${index + 1}` });
      }
    });
  }
}

if (scanned === 0) {
  console.error(
    'check-surface-routes: scanned 0 source files. Fix this script before trusting it.'
  );
  process.exit(1);
}

const dead = opened.filter(
  (call) => !surfaces.has(call.key) && !KNOWN_DEAD_OPENS.has(`${call.where} ${call.key}`)
);

// A recorded call site that no longer matches is either fixed or moved. Either way
// the list is now describing code that is not there, so it has to be re-read rather
// than left to rot into an allowlist nobody can account for.
const stale = [...KNOWN_DEAD_OPENS].filter(
  (entry) => !opened.some((call) => `${call.where} ${call.key}` === entry)
);

const unaddressed = [...surfaces]
  .filter((key) => !routed.has(key) && !NO_ADDRESS_YET.has(key))
  .sort();
const orphaned = [...routed].filter((key) => !surfaces.has(key)).sort();

if (unaddressed.length > 0) {
  console.error(
    `\n${unaddressed.length} surface(s) have no address. Add a route to ${ROUTES_FILE} for each:\n`
  );
  for (const key of unaddressed) console.error(`  ${key}`);
}

if (orphaned.length > 0) {
  console.error(
    `\n${orphaned.length} route(s) name a surface that is not registered. Either the surface key was renamed (which orphans every link already sent — prefer an alias) or the route is stale:\n`
  );
  for (const key of orphaned) console.error(`  ${key}`);
}

if (dead.length > 0) {
  console.error(
    `\n${dead.length} call(s) open a surface that is not registered. Each is a control that does nothing at all, silently — \`controller.open\` returns null for an unknown key:\n`
  );
  for (const call of dead) console.error(`  ${call.where}  opens '${call.key}'`);
}

if (stale.length > 0) {
  console.error(
    `\n${stale.length} recorded dead-open call site(s) no longer match. Remove them if they are fixed, or re-record them if they moved:\n`
  );
  for (const entry of stale) console.error(`  ${entry}`);
}

if (unaddressed.length > 0 || orphaned.length > 0 || dead.length > 0 || stale.length > 0) {
  console.error('');
  process.exit(1);
}

console.log(
  `check-surface-routes: ${surfaces.size} surfaces, all addressed ` +
    `(${NO_ADDRESS_YET.size} recorded without one); ${opened.length} open() calls across ` +
    `${scanned} files, all resolving (${KNOWN_DEAD_OPENS.size} recorded dead).`
);
