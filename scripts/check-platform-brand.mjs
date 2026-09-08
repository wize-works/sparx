#!/usr/bin/env node
/**
 * Fails when SHARED code puts a product's name into text a person reads.
 *
 * sparx and Piggles are two BRANDS on one platform, one database and one tenant
 * pool. `Tenant.platformBrand` records which, and it is a TENANT column rather
 * than a deployment setting precisely because the readers that need it most --
 * the `email.send` worker consuming a Pub/Sub event, an edge OG route, the
 * Stripe webhook -- have no request context to infer it from.
 *
 * So a literal product name inside `wizeworks/packages` is wrong by
 * construction: that code serves both brands, and the string can only ever be
 * right for one of them. It reaches people in three ways, worst first:
 *
 *   1. A tenant's own customers -- a starter site footer, a published policy.
 *   2. The operator             -- "sparx cannot place the call", on a screen
 *                                  whose every other word says Piggles.
 *   3. Their inbox              -- "You earned a commission on sparx".
 *
 * `@wizeworks/brand-core` already solves this: `platformBrandIdentity(brand).name`
 * returns the product's name as a person reads it, configured rather than
 * computed, because sparx is deliberately lowercase and Piggles deliberately
 * capitalised. The strings this check finds simply bypass it.
 *
 * WHAT TO DO WHEN THIS FAILS. Three right answers, and "add it to the debt
 * list" is not one of them:
 *
 *   REMOVE the name   Most prose does not need it. "This is starter wording,
 *                     not legal advice" says everything "provided by sparx"
 *                     did, and is true in both products.
 *   RESOLVE the name  When the thing genuinely IS branded -- sparx Pay has a
 *                     sibling called Piggles Pay -- take it from
 *                     platformBrandIdentity(brand).name.
 *   ALLOW it          Only when the string names a SPECIFIC product that exists
 *                     under one brand alone (sparx.market), or is not
 *                     user-facing at all (an env var, a DMARC record, an RLS
 *                     role, an iCal PRODID). Add it to ALLOWED with a reason.
 *
 * DEBT is the set that existed when this check was written. It may SHRINK and
 * never grow. A string in neither list fails the build.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS STANDS (2026-08-21)
 * ---------------------------------------------------------------------------
 *
 * 102 when the check was written, 79 after the first pass, 61 now.
 *
 * PAYMENTS IS DONE. It was the awkward one and the reason the count sat still:
 * `GATEWAY_CATALOG` was a static readonly array served over an API mirror, so
 * there was no brand in scope where the strings were written. What forced it was
 * a persona — a Piggles bakery opening the provider picker to choose who handles
 * her money, and reading "No sparx fee" seven times down one page.
 *
 * The shape that worked is the one this header predicted, and it is worth
 * copying for the rest:
 *
 *   · The data carries a `{platform}` token (`PLATFORM_TOKEN` in
 *     @wizeworks/brand-core) instead of a name.
 *   · `gatewayCatalog(brand)` and `getGatewayDescriptor(id, brand)` resolve it.
 *   · THE RAW ARRAY IS NOT EXPORTED. That is what closes the trap this header
 *     warned about — a caller cannot forget to resolve, because there is no
 *     unresolved value to reach. The one boot-time consumer that genuinely has
 *     no brand (the integration registry, built once for every brand at once)
 *     goes through `gatewayCatalogTemplate()`, named to be alarming, and the
 *     ROUTE that serves those descriptors resolves per tenant.
 *   · "sparx Pay" was a RESOLVE, not a REMOVE — Piggles Pay is its sibling. Its
 *     `id` stays `sparx_pay`: a wire value and a stored column, seen by nobody.
 *
 * What is left, heaviest first:
 *
 *   builder (~11)   MCP tool descriptions and authoring vocabulary. Read by an
 *                   agent rather than a person, but they teach it to write
 *                   "sparx" into a tenant's site. Worth doing, low risk.
 *   commerce-       Onboarding/import copy. Straight REMOVE, same as the first
 *     schemas (~8)  23 that went.
 *   db/seed         Demo content naming sparx. Harmless in prod (seed only),
 *                   but it is what a new Piggles demo tenant would read.
 *   the rest        sparx.market and its settlement mail -- ALLOWED, a real
 *                   first-party product under one brand. Do not "fix" these.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from this file, never by counting '..' from the cwd -- a check that
// guesses its own root is one move away from scanning nothing and printing OK.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Shared code only. An app under sparx/ or piggles/ serves ONE brand and may
// name ITSELF; these packages serve both and may not name either.
const SCAN_ROOTS = ['wizeworks/packages'];

// THE SECOND PASS, and the reason it exists.
//
// "An app serves one brand and may name it" is true of its OWN name and false of
// the other one, and reading it as symmetric left the brand apps unscanned. A
// Piggles shop owner setting up a notification was shown the example address
// `https://example.com/hooks/sparx`, and the check that exists to stop exactly
// that could not see the file (persona issue 406). Piggles is checked for
// "sparx" and sparx for "piggles"; each may still say its own name freely.
// It found 62 on the first run and 14 once it learned to skip a default the
// brand's own copy file already replaces. All 14 are dead behind a RUNTIME seam
// a static check cannot see -- `hiddenSurfaces` (partner.*), `hiddenFeatures`
// (sparx Pay, sparx.market), or the section-rename table, whose keys are the
// other brand's headings by definition. They are banked in the debt file, and
// per piggles/CLAUDE.md they must NOT be "fixed": renaming another product's
// marketplace to Piggles' invents something nobody can sign up for, which is
// worse than the leak because nothing looks wrong any more.
const BRAND_TREES = [
  { dir: 'piggles', foreign: 'sparx' },
  { dir: 'sparx', foreign: 'piggles' },
];
const FOREIGN_DEBT_FILE_NAME = 'foreign-brand-debt.txt';

const BRANDS = ['sparx', 'piggles'];

// Substrings that make a literal legitimately brand-named or not user-facing.
// Each one is a decision, not a convenience.
const ALLOWED_PATTERNS = [
  // sparx.market is a REAL first-party marketplace that exists under the sparx
  // brand alone; Piggles hides the surface entirely. Naming it is correct.
  'sparx.market',
  'sparx_market',
  // Infrastructure and wire formats. Never rendered to anyone.
  'SPARX_',
  'sparx_owner',
  'sparx_app',
  'X-sparx',
  'x-sparx',
  '@sparx/',
  '@wizeworks/',
  'sparx.works',
  'sparx.email',
  'sparx.>',
  'noreply@',
  'dmarc@',
  'WizeWorks//',
  // CSS class prefixes emitted into markup, not words.
  'sparx-callout',
  'sparx-embed',
  'sparx-content',
];

const DEBT_FILE = join(ROOT, 'scripts', 'platform-brand-debt.txt');

function stripComments(src) {
  let out = '';
  let state = null;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    const n = src[i + 1] ?? '';
    if (state === null) {
      if (c === '/' && n === '/') {
        state = 'line';
        i += 1;
        continue;
      }
      if (c === '/' && n === '*') {
        state = 'block';
        i += 1;
        continue;
      }
      out += c;
    } else if (state === 'line') {
      if (c === '\n') {
        state = null;
        out += c;
      }
    } else if (c === '*' && n === '/') {
      state = null;
      i += 1;
    }
  }
  return out;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') && !entry.includes('.test.')) {
      files.push(full);
    }
  }
  return files;
}

const LITERAL = /(['"`])([^'"`\n]{2,400}?)\1/g;

// JSX TEXT, which is where most prose in a React app actually lives.
//
// The check read quoted strings only, so it saw `placeholder="…/hooks/sparx"`
// but not `<p>Featured by sparx</p>` — and the second is the commoner shape by
// a wide margin. Proving that gap was the point of trying to make the new pass
// go red and watching it stay green.
const JSX_TEXT = />([^<>{}'"`]{2,400})</g;

// A TypeScript generic also sits between `>` and `<` — `Promise<Foo>` next to
// `Bar<Baz>` reads as text to that regex, and the first run reported
// `(event: SparxEvent` as a brand leak. Prose does not carry code punctuation.
const CODE_PUNCTUATION = /[;=(){}|[\]]/;

/** Every run of prose in a file: quoted literals, and JSX text in a .tsx. */
function* literals(src, file) {
  for (const m of src.matchAll(LITERAL)) yield m[2].trim();
  if (!file.endsWith('.tsx')) return;
  for (const m of src.matchAll(JSX_TEXT)) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (text === '' || CODE_PUNCTUATION.test(text)) continue;
    yield text;
  }
}

// A literal only counts when it reads like something somebody could see. A bare
// identifier or a path is not prose.
function isProse(lit) {
  if (!lit.includes(' ')) return false;
  if (/^[@./]/.test(lit) || /^https?:/.test(lit)) return false;
  return true;
}

function scan() {
  const found = [];
  let scanned = 0;
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root);
    // Assert the root EXISTS. A tree move that silently empties this check is
    // exactly how sibling checks came to scan nothing and report green.
    if (!existsSync(abs)) {
      console.error('\nBrand check FAILED: scan root is missing: ' + root);
      console.error('  A moved or renamed tree makes this check blind. Fix the path.\n');
      process.exit(1);
    }
    for (const file of walk(abs)) {
      scanned += 1;
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const lit of literals(src, file)) {
        const low = lit.toLowerCase();
        if (!BRANDS.some((b) => low.includes(b))) continue;
        if (!isProse(lit)) continue;
        if (ALLOWED_PATTERNS.some((a) => lit.includes(a))) continue;
        found.push({ file: relative(ROOT, file).split(sep).join('/'), lit });
      }
    }
  }
  return { found, scanned };
}

/**
 * Defaults that a brand's own copy file already replaces.
 *
 * These consoles were forked from the other brand's, so a surface reads
 * `productCopy('some.key', <the other brand's sentence>)` and the brand's
 * copy file supplies its own. An overridden default is DEAD TEXT — reporting it
 * would fill the list with strings nobody can reach and bury the ones they can.
 */
function replacedDefaults(dir) {
  const copyFile = join(ROOT, dir, 'apps/workbench/lib/console/copy.ts');
  if (!existsSync(copyFile)) return new Set();
  const copySrc = readFileSync(copyFile, 'utf8');
  const overridden = new Set([...copySrc.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
  const dead = new Set();
  for (const file of walk(join(ROOT, dir))) {
    const src = stripComments(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/productCopy(?:With)?\(\s*'([^']+)'\s*,\s*(['"`])([\s\S]*?)\2/g)) {
      if (overridden.has(m[1])) dead.add(m[3].trim());
    }
  }
  return dead;
}

/** Prose in one brand's tree that names the OTHER brand. */
function scanForeign() {
  const found = [];
  let scanned = 0;
  let trees = 0;
  let replaced = 0;
  for (const { dir, foreign } of BRAND_TREES) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    trees += 1;
    const dead = replacedDefaults(dir);
    for (const file of walk(abs)) {
      // A brand's own docs may quote the other product; only shipped code counts.
      if (file.includes(`${sep}docs${sep}`)) continue;
      scanned += 1;
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const lit of literals(src, file)) {
        if (!lit.toLowerCase().includes(foreign)) continue;
        if (!isProse(lit)) continue;
        if (ALLOWED_PATTERNS.some((a) => lit.includes(a))) continue;
        if (dead.has(lit)) {
          replaced += 1;
          continue;
        }
        found.push({ file: relative(ROOT, file).split(sep).join('/'), lit });
      }
    }
  }
  // Both trees are expected. One means a rename made this pass blind.
  if (trees < BRAND_TREES.length) {
    console.error('\nBrand check FAILED: found ' + trees + ' of ' + BRAND_TREES.length + ' brand');
    console.error('  trees. A moved or renamed tree makes the foreign-name pass blind.\n');
    process.exit(1);
  }
  return { found, scanned, replaced };
}

const { found, scanned } = scan();
const unique = [...new Set(found.map((f) => f.lit))].sort();

const foreign = scanForeign();
const foreignUnique = [...new Set(foreign.found.map((f) => f.lit))].sort();
const FOREIGN_DEBT_FILE = join(ROOT, 'scripts', FOREIGN_DEBT_FILE_NAME);

if (process.argv.includes('--update')) {
  writeFileSync(DEBT_FILE, unique.join('\n') + '\n', 'utf8');
  writeFileSync(FOREIGN_DEBT_FILE, foreignUnique.join('\n') + '\n', 'utf8');
  console.log('Wrote ' + unique.length + ' known string(s) to ' + relative(ROOT, DEBT_FILE));
  console.log(
    'Wrote ' + foreignUnique.length + ' known string(s) to ' + relative(ROOT, FOREIGN_DEBT_FILE)
  );
  process.exit(0);
}

const debt = existsSync(DEBT_FILE)
  ? new Set(
      readFileSync(DEBT_FILE, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    )
  : new Set();

const fresh = found.filter((f) => !debt.has(f.lit));
const fixed = [...debt].filter((d) => !unique.includes(d));

// The denominator, always. A count with no total is unreadable as progress and
// hides a check that has stopped looking at anything.
console.log(
  'Brand check: ' +
    scanned +
    ' shared file(s) scanned, ' +
    unique.length +
    ' brand-named string(s) found, ' +
    debt.size +
    ' known.'
);

if (fresh.length > 0) {
  console.error(
    '\nBrand check FAILED: ' + fresh.length + ' NEW brand-named string(s) in shared code.\n'
  );
  for (const f of fresh) console.error('  ' + f.file + '\n    ' + f.lit + '\n');
  console.error('  Shared packages serve BOTH brands, so a literal name is wrong in one of');
  console.error('  them at all times. Remove the name, or resolve it from');
  console.error('  platformBrandIdentity(brand).name. See the header of this script.\n');
  process.exit(1);
}

if (fixed.length > 0) {
  console.log(
    '\n' + fixed.length + ' known string(s) are gone. Run --update to bank the progress:'
  );
  for (const f of fixed.slice(0, 20)) console.log('  - ' + f);
}

/* ── Pass two: a brand app naming the OTHER brand ───────────────────────── */

const foreignDebt = existsSync(FOREIGN_DEBT_FILE)
  ? new Set(
      readFileSync(FOREIGN_DEBT_FILE, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    )
  : new Set();

const foreignFresh = foreign.found.filter((f) => !foreignDebt.has(f.lit));
const foreignFixed = [...foreignDebt].filter((d) => !foreignUnique.includes(d));

console.log(
  'Foreign-brand check: ' +
    foreign.scanned +
    ' brand file(s) scanned, ' +
    foreignUnique.length +
    ' foreign-named string(s) found, ' +
    foreignDebt.size +
    ' known, ' +
    foreign.replaced +
    " replaced by the brand's own copy."
);

if (foreignFresh.length > 0) {
  console.error(
    '\nBrand check FAILED: ' + foreignFresh.length + ' NEW string(s) naming the OTHER brand.\n'
  );
  for (const f of foreignFresh) console.error('  ' + f.file + '\n    ' + f.lit + '\n');
  console.error('  A brand app may name ITSELF. Naming the other product tells a customer');
  console.error('  about something they cannot buy, in a console whose every other word');
  console.error('  says the brand they did. Remove it, or say what the thing does.\n');
  process.exit(1);
}

if (foreignFixed.length > 0) {
  console.log(
    '\n' + foreignFixed.length + ' known foreign-named string(s) are gone. Run --update to bank it:'
  );
  for (const f of foreignFixed.slice(0, 20)) console.log('  - ' + f);
}

console.log('OK: no new brand-named strings in shared code, and none naming the other brand.');
