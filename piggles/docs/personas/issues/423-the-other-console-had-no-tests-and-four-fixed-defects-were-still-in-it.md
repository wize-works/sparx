# 423 — The other console had no tests, and four fixed defects were still living in it

**Status:** fixed
**Severity:** major
**Found by:** act 88 · giving `sparx/apps/workbench` the test seat piggles already had
**Surface:** sparx › the operator console — media, page results, failed writes, and setup
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

`piggles/apps/workbench` has a test seat, and its own config explains why an app
earns one: the console decides what a person READS, and every one of those rules
is a pure function whose failure is invisible to typecheck, lint and the eye.
Three shipped that way before the seat existed, and a fourth would have deleted a
site.

`sparx/apps/workbench` had **no seat at all** — no `vitest.config.ts`, no `test`
script, no vitest. So the same rules, in the same shapes, went unchecked there.

Giving it one and porting the tests found **four defects already fixed in piggles
and still live in sparx.** None of them was a difference anyone had decided on;
each was a fix that landed in one console and was never carried to the other.

## What the tests found

**1. Setup would rebuild a business that was already running.** Piggles' issue 364
put `isBusinessRunning` in front of both setup flows. sparx has the same door and
no guard: `catalog/onboarding.ts` registers "Describe your business" and "Set up
step by step" as ordinary surfaces, and says so in its own comment — "setup is
never a one-way door". Open either from ⌘K on a tenant trading for a year and the
first commit writes:

- `saveModules(input.modules)` — the WHOLE switchboard at once, so every module
  the curated example does not mention is turned off;
- `selectTemplate` — a ready-made site laid into the site already there;
- `saveWorkspace({ companyName, slug, siteName })` — the business and its site
  renamed.

Neither flow reads a single thing about the tenant first.

**2. Every unmeasured file said it weighed nothing.** Piggles' issue 380 made
`byteSize` nullable and added `sizeLabel`. sparx still coerced a missing size to
zero — `Number.isFinite(byteSize) ? byteSize : 0` — and printed a confident
**0 bytes** through `formatBytes` in three places: the media list, the detail
header and its Size fact. No file is zero bytes; that number means nobody
measured it.

**3. A shop with sales was told no page had sold anything.** Piggles' rule
`salesUntraced` exists because a row's Bought column counts orders whose buyer's
first pageview that day was on that page — so when nothing could be traced, every
row reads `0 (0%)` and an owner who took fourteen orders is told her pages sold
nothing. sparx rendered exactly that, with no caveat and no dash.

**4. A failed write blamed a connection that was never broken.** Piggles' issue
386 rewrote `isOffline` because `!navigator.onLine` is true both when the browser
reports offline AND when it reports nothing at all — `!undefined` is `true`. sparx
still carried the old test, and also still folded a 503 or a failed CORS preflight
into "you are offline", which sends someone to restart a router over a server
problem.

## The fix

**The seat.** `sparx/apps/workbench` gains `vitest.config.ts` (the same literal
config, with its own header explaining why a SECOND copy exists), a `test` script
and the vitest devDependency, so `pnpm test` and the pre-push guard now cover it.

**The rules.** Five test files ported, and the four defects fixed to satisfy them:

| Ported test                                  | What it forced into sparx                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `lib/onboarding/entry.test.ts`               | `isSetupStarted` + `isBusinessRunning`, and a `SetupGate` in front of both reopenable setup surfaces              |
| `surfaces/cms/media-admin.test.ts`           | `byteSize: number \| null`, `linked`, `sizeLabel`, and the three call sites that printed `0 bytes`                |
| `surfaces/builder/page-results-data.test.ts` | `AttributionCoverage`, `salesUntraced`, dashes instead of zeros in Bought and Sales, and the caveat that says why |
| `lib/api/write-failure.test.ts`              | the `isOffline` correction, the `unreachable` split, and the 409 split                                            |
| `components/launcher-match.test.ts`          | nothing — sparx already had [422]'s fix, ported the same session                                                  |

**44 tests, all passing.**

## What was NOT ported, and why

Eight of piggles' thirteen test files cover modules sparx does not have at all —
billing lifecycle, blueprint words, forms, redirects, webhooks. There is nothing
to test there, and writing a test for an absent module would be theatre.

The two consoles are **copies, not a shared package, and must stay that way**:
neither brand tree may import from the other. So a rule that exists in both is two
files, and `check:console-parity` is what keeps them in step. The test seat is now
the second thing keeping them honest, and it is the one that catches a fix landing
in only one of them — which is exactly what happened four times here.

## Verified

- sparx: **44 tests pass**, `tsc` clean, `eslint . --max-warnings=0` clean.
- piggles: **119 tests pass**, unchanged.
- All thirteen structural checks OK, `check:boundaries` and
  `check:console-parity` included.
- Grepped both trees: no import crosses between them in either direction.

**One thing the user must run.** `vitest` is declared in sparx's
`devDependencies` but not yet linked into `sparx/apps/workbench/node_modules`, so
`tsc` reports `Cannot find module 'vitest'` for the two test files until
**`pnpm install`** is run. The tests themselves already run (the binary resolves
from the workspace). Nothing else is outstanding.
