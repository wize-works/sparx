#!/usr/bin/env node
// The two consoles, held level.
//
// sparx's workbench and the Piggles console are the same PRODUCT SHAPE wearing
// two brands: a rail of apps, a dock of panes, a launcher, a toolbar, a status
// bar, and the system furniture that makes all of it survivable — toasts,
// confirms, crash reporting, deep links, feedback, notifications. Almost none of
// that is a feature anybody asks for by name. It is what you only notice when it
// is missing, in the moment you needed it.
//
// Which is the whole problem. A one-off audit finds what one console has and the
// other lacks TODAY, and rots the same afternoon somebody adds a capability to
// whichever console they happened to be working in. The gap then sits there
// looking exactly like a deliberate decision, because a missing file and a
// decided-against file are byte-for-byte identical: nothing.
//
// So this compares the two consoles structurally and fails on any divergence
// that is not on the exception list below WITH A STATED REASON. Adding something
// to one console turns this red until it is either built in the other or argued
// down in writing. The argument is the deliverable; the check just refuses to
// let it be skipped.
//
// ── WHAT IT COMPARES ────────────────────────────────────────────────────────
//
//   components/**   every module under each console's components tree
//   lib/**          every module under each console's lib tree
//   routes          every route.ts / page.tsx under app/
//   deps            each console's package.json dependencies
//   mounting        that the system furniture is REACHABLE from the root layout
//
// The last one exists because presence is not the same as being wired up. An
// imported-by-nobody provider renders exactly as much as a deleted one, so the
// check walks the import graph from `app/layout.tsx` and asserts each piece of
// furniture is actually in it.
//
// ── THE TWO LIMITS, STATED PLAINLY ──────────────────────────────────────────
//
// 1. A diff cannot find what NEITHER console has. If both are missing an idle
//    timeout, both are missing a print stylesheet, both forgot offline handling
//    — this passes, green, forever. It answers "have these two drifted apart",
//    never "are these two finished". Do not read a pass as coverage.
//
// 2. It compares NAMES, not depth. Two files called pane-toolbar.tsx pair here
//    whether one is 94 lines and the other 283. That is a real blind spot and a
//    deliberate one: the alternative is comparing exported symbols, which two
//    consoles built in two idioms would fail constantly and unhelpfully. When a
//    paired name hides a capability difference, the fix is to give the missing
//    capability its own module, at which point this catches it.
//
// Pure Node, no dependencies. Same family as check:events / check:routes /
// check:docker / check:boundaries / check:deletability.

import fs from 'node:fs';
import path from 'node:path';

/** Resolve the repo root by its marker, never by counting `..` up from here. */
function repoRoot() {
  let dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  for (let i = 0; i < 10; i += 1) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error('check:console-parity — could not find pnpm-workspace.yaml above this script');
}

const ROOT = repoRoot();

const CONSOLES = {
  sparx: { dir: 'sparx/apps/workbench', label: 'sparx workbench' },
  piggles: { dir: 'piggles/apps/workbench', label: 'Piggles console' },
};

/**
 * The same thing under two names.
 *
 * Piggles is not a sparx clone and its vocabulary is deliberate — an owner has
 * Apps, not modules, and a Console, not a workbench. Without this map every one
 * of those decisions reads as a missing file, the report is all noise, and the
 * check gets ignored, which is the only way a check can truly fail.
 *
 * `canonical` is neither side's spelling on purpose: this is a comparison
 * between equals, and naming the buckets after sparx would quietly make sparx
 * the reference implementation.
 *
 * Matched on SEGMENT boundaries, longest first, so `components/rail` never
 * swallows `components/rail-preference`.
 */
const RENAMES = [
  {
    canonical: 'components/~shell',
    sparx: 'components/workbench-shell',
    piggles: 'components/console-shell',
  },
  {
    canonical: 'components/~shell-compact',
    sparx: 'components/mobile-shell',
    piggles: 'components/compact-console',
  },
  { canonical: 'components/~app-rail', sparx: 'components/rail', piggles: 'components/app-rail' },
  {
    canonical: 'components/~app-panel',
    sparx: 'components/module-panel',
    piggles: 'components/app-panel',
  },
  { canonical: 'components/~topbar', sparx: 'components/toolbar', piggles: 'components/topbar' },
  // The phone's two-level browse. Same sheet, same drill-down, same reused
  // panel underneath — Piggles browses Apps where sparx browses modules, which
  // is the product vocabulary difference and not a missing screen.
  {
    canonical: 'components/mobile/~catalog-sheet',
    sparx: 'components/mobile/modules-sheet',
    piggles: 'components/mobile/apps-sheet',
  },
  // The same grid of tiles behind that sheet's first level, under each
  // product's own word for the thing a tile opens.
  {
    canonical: 'components/mobile/~catalog-grid',
    sparx: 'components/mobile/module-grid',
    piggles: 'components/mobile/app-grid',
  },
  { canonical: 'lib/~console-catalog', sparx: 'lib/product', piggles: 'lib/product' },
  // The guide. Both consoles teach the same two tiers; Piggles says App where
  // sparx says module, and calls the whole thing a guide because "tour" is a
  // word about the software rather than about the business.
  { canonical: 'lib/tour/~runtime', sparx: 'lib/tour/use-tour', piggles: 'lib/tour/use-guide' },
  // The card that carries the words, and the chip it falls back to.
  { canonical: 'lib/tour/~chip', sparx: 'lib/tour/tour-chip', piggles: 'lib/tour/guide-chip' },
  {
    canonical: 'lib/tour/~first-run',
    sparx: 'lib/tour/first-run-tour',
    piggles: 'lib/tour/first-run-guide',
  },
  {
    canonical: 'lib/tour/~deep-tours',
    sparx: 'lib/tour/module-tours',
    piggles: 'lib/tour/app-tours',
  },
  {
    canonical: 'lib/tour/~deep-offers',
    sparx: 'lib/tour/module-tour-offers',
    piggles: 'lib/tour/app-tour-offers',
  },
];

/**
 * A directory on one side standing in for a single module on the other.
 *
 * Piggles files obey a 250-line ceiling (its RULE #0.5), so a component that is
 * one file in sparx is often a folder here. That is a house style, not a
 * capability difference, and collapsing the folder to its own name is what keeps
 * it from reading as four missing files plus one deleted one.
 *
 * Declared, never inferred: a folder that appears on one side and means
 * something genuinely new must show up as a divergence, not get absorbed.
 */
const COLLAPSE = [
  {
    side: 'piggles',
    path: 'components/rail/app-groups',
    into: 'components/~app-rail',
    why: 'the rail’s app grouping, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/rail/waiting',
    into: 'components/~app-rail',
    why: 'the rail’s own waiting state, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/panel/nav-row',
    into: 'components/~app-panel',
    why: 'one row of the app panel, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/panel/shortcut-panel-host',
    into: 'components/~app-panel',
    why: 'which shortcut list the panel is showing, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/rail/surface-row',
    into: 'components/~app-rail',
    why: 'one row shared by the rail and the shortcut panel, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/panel/panel-header',
    into: 'components/~app-panel',
    why: 'the panel’s header, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/panel/panel-sections',
    into: 'components/~app-panel',
    why: 'the panel’s section list, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/rail/shortcuts',
    into: 'components/~app-rail',
    why: 'the rail’s favourites strip, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'components/saved-views',
    why: 'split under the 250-line rule; sparx keeps one saved-views.tsx',
  },
  {
    side: 'piggles',
    path: 'lib/onboarding/module-graph',
    into: 'lib/onboarding/modules',
    why: 'the dependency graph, lifted out of modules.ts under the 250-line rule — the same capability, in two files here and one there',
  },
  {
    side: 'piggles',
    path: 'components/status',
    into: 'components/status-bar',
    why: 'the strip’s two chips and its activity rules, lifted out under the 250-line rule',
  },
  {
    side: 'piggles',
    path: 'lib/tour/~deep-tours',
    why: 'one file per color group; sparx keeps one module-tours.ts',
  },
];

/**
 * Divergences that are DECIDED, each with the decision.
 *
 * `only` is the side that has it. A reason that amounts to "the other one just
 * doesn't" is not a reason — it is the gap, written down and waved past.
 */
const EXCEPTIONS = [
  // ── Auth: the consoles are entered differently ──────────────────────────
  {
    axis: 'components',
    only: 'sparx',
    path: 'components/auth',
    why: 'sparx signs people in at the workbench itself; getpiggles.com owns every Piggles credential screen and hands the console a session.',
  },
  {
    axis: 'components',
    only: 'sparx',
    path: 'components/auth-shell',
    why: 'the chrome around sparx’s own sign-in screens; Piggles has no sign-in screen to wrap.',
  },
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/session',
    why: 'the receiving half of that same handoff — an unsigned visitor goes to the account app, not to a /sign-in route this console does not have.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/sign-in',
    why: 'auth lives at getpiggles.com for Piggles (see components/auth).',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/sign-up',
    why: 'auth lives at getpiggles.com for Piggles.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/reset-password',
    why: 'auth lives at getpiggles.com for Piggles.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/accept-invite',
    why: 'auth lives at getpiggles.com for Piggles.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/api/auth',
    why: 'Better Auth is mounted by the app that owns the credential screens — workbench for sparx, the account app for Piggles.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/api/internal/user-password-reset',
    why: 'staff-initiated reset, issued by whichever app mounts Better Auth.',
  },
  {
    axis: 'routes',
    only: 'piggles',
    path: 'app/auth/callback',
    why: 'where the account app lands a handed-off session; sparx has no handoff because it never leaves.',
  },
  {
    axis: 'routes',
    only: 'piggles',
    path: 'app/sign-out',
    why: 'sign-out has to clear the handoff cookie and return to the account app; sparx signs out through Better Auth in place.',
  },

  // ── Billing: the console never knows a price ────────────────────────────
  {
    axis: 'components',
    only: 'sparx',
    path: 'components/billing',
    why: 'sparx sells tiers, so the workbench carries a trial chip and an upgrade banner. Piggles has ONE flat plan (its RULE #2) and the console shows a warning-only capacity notice instead — components/rail/capacity-notice.tsx.',
  },
  {
    axis: 'lib',
    only: 'sparx',
    path: 'lib/billing',
    why: 'same decision: prices and plan comparison belong to the Piggles account app, never to the console.',
  },

  // ── Products that are genuinely not the same product ────────────────────
  {
    axis: 'lib',
    only: 'sparx',
    path: 'lib/mcp-oauth-metadata',
    why: 'moved to the Piggles account app in B2.1, next to the authorization server that issues the tokens it describes.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/.well-known',
    why: 'the discovery documents for that same authorization server; Piggles serves them from the account app.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/oauth/consent',
    why: 'the consent screen belongs beside the authorization server — account app for Piggles.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/api/internal/partner-provision',
    why: 'partner-provisioned tenants are a sparx go-to-market motion, not a console capability.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/all-apps-dialog',
    why: 'Piggles ships every app to every owner and the rail is a PREFERENCE, so "all apps" is a picker. sparx activates modules commercially, so its equivalent screen is an upgrade path and lives in billing.',
  },
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/studio',
    why: 'the site studio is a Piggles surface built on @wizeworks/studio; sparx edits sites in the builder module instead.',
  },
  {
    axis: 'deps',
    only: 'piggles',
    path: '@wizeworks/studio',
    why: 'see lib/studio.',
  },
  {
    axis: 'routes',
    only: 'piggles',
    path: 'app/api/businesses',
    why: 'the Piggles business switcher reads the list from the console’s own session; sparx switches tenants through api-rest.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/health',
    why: 'sparx answers probes at both /health and /api/health; Piggles answers at /api/health only, which is what its Deployment probes ask for (verified against the manifests).',
  },

  // ── Brand expression ────────────────────────────────────────────────────
  {
    axis: 'components',
    only: 'sparx',
    path: 'components/spark-field',
    why: 'a tiled sparx-mark watermark. Each brand decides its own decorative treatment; Piggles uses illustrated state art (components/state-art.tsx) and no watermark.',
  },
  { axis: 'deps', only: 'sparx', path: '@sparx/brand', why: 'each brand imports its own marks.' },
  {
    axis: 'deps',
    only: 'piggles',
    path: '@piggles/brand',
    why: 'each brand imports its own marks.',
  },
  {
    axis: 'deps',
    only: 'piggles',
    path: '@piggles/mascot',
    why: 'the Piggles mascot set; sparx has no mascot.',
  },
  {
    axis: 'deps',
    only: 'piggles',
    path: '@piggles/ui',
    why: 'Piggles-specific compositions over silicaui.',
  },
  { axis: 'deps', only: 'piggles', path: '@piggles/config', why: 'Piggles runtime configuration.' },
  { axis: 'deps', only: 'piggles', path: '@piggles/auth-handoff', why: 'see lib/session.' },
  {
    axis: 'deps',
    only: 'sparx',
    path: 'lucide-react',
    why: 'the two brands draw icons differently — sparx uses Lucide, Piggles uses Font Awesome Pro solid.',
  },
  {
    axis: 'deps',
    only: 'piggles',
    path: '@fortawesome/pro-solid-svg-icons',
    why: 'see lucide-react.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/app-scope',
    why: 'writes `data-app` for the SHELL, which thinks in Piggles apps; both consoles keep components/module-scope.tsx for surfaces, which think in platform modules.',
  },

  // ── Same capability, different factoring ────────────────────────────────
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/~topbar/business-switcher',
    why: 'a Piggles owner can hold several BUSINESSES and act as one at a time, so the console carries a tenant switcher beside the site switcher. sparx’s workbench is entered for one tenant and the workspace renders as plain identity — there is nothing in this window to switch it to. The capability itself is not missing: sparx switches tenants through api-rest (see app/api/businesses), and if the workbench ever grows the control it belongs here, next to components/toolbar/site-switcher.tsx.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/oauth-popup-relay',
    why: 'both consoles land OAuth popups on the same three callback routes; Piggles factored the identical postMessage-and-close into one component where sparx repeats it per page. Capability paired, factoring differs.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/console-providers',
    why: 'the same provider stack both consoles mount — lifted out of app/layout.tsx because Piggles’ layout also carries the handoff session read. sparx composes it inline.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/desktop-shell',
    why: 'the desktop presentation, lifted out of console-shell.tsx under the 250-line rule. sparx has no line ceiling (CLAUDE.md: cohesion is the only rule), so workbench-shell.tsx keeps both presentations and the boot it owns in one piece. Same two presentations, one file boundary apart.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/compact-shell',
    why: 'the other half of that same split — the compact presentation assembled, wrapping compact-console.tsx the way desktop-shell wraps the desktop chrome. sparx keeps both in workbench-shell.tsx.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/chrome-column',
    why: 'the rail-and-panel column, lifted out of the desktop shell under the same 250-line rule. sparx composes the two directly in workbench-shell.tsx.',
  },
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/console',
    why: 'the Piggles app catalog, rail grouping and lexicon — the counterpart to sparx’s module catalog, which sits in @wizeworks/modules because sparx sells those modules separately.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/panel/shortcut-panel',
    why: 'Favourites and Recent, as a panel. Both consoles carry both lists; they differ in WHERE, and that follows from the rail. sparx keeps them in the rail itself (components/rail.tsx, useFavorites/useRecents). A collapsed Piggles rail cannot show either — five nameless icons above fifteen more is where people lose their place — so each becomes a row that opens its list in the panel. Same capability, two placements; see lib/rail-preference for the same split.',
  },
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/rail-preference',
    why: 'Piggles defaults the rail to labelled and sparx to icons-only; a shared key would have to pick one default, and "no preference expressed" means different things to the two products.',
  },
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/surfaces/piggles-catalog',
    why: 'the Piggles surface catalog; sparx’s is lib/surfaces/catalog/, which both consoles have.',
  },
  {
    axis: 'components',
    only: 'sparx',
    path: 'components/consent-ask',
    why: 'the analytics question itself. Piggles asks on getpiggles.com — before anybody reaches their business — and its console only ever reads the answer. sparx has no separate account domain, so the workbench asks, once, and never as a bar.',
  },
  {
    axis: 'routes',
    only: 'sparx',
    path: 'app/api/consent',
    why: 'somewhere has to WRITE the analytics answer, and api-rest deliberately refuses to (a tracked surface must not be able to change its own permission). Piggles writes it in its account app; sparx has none, so the app that owns Better Auth owns the write.',
  },

  // ── Capacity: metered flat plan vs sold tiers ───────────────────────────
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/rail/capacity-notice',
    why: 'Piggles is one flat plan with meters, so the rail warns when a meter approaches its ceiling. sparx sells tiers, where the same moment is an upgrade prompt — components/billing/billing-banner.tsx.',
  },

  // ── Brand art ───────────────────────────────────────────────────────────
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/state-art',
    why: 'the one place that decides whether a brand draws its own empty/error/waiting states. Piggles does (its mascot, under strict rules); sparx deliberately draws none, so there is nothing for it to decide.',
  },

  // ── Windows on a desk: a Piggles product premise, not furniture ─────────
  //
  // The Piggles console lets an owner float, tile and place panes as windows,
  // and remembers an arrangement per presentation. sparx's workbench is a dock:
  // panes are tabs and splits, and the arrangement is the dock's. That is a
  // different answer to "who decides what is on screen", not a missing feature —
  // and it is the same premise that shapes how the Piggles tour has to work.
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/rail/layouts-menu',
    why: 'saved ARRANGEMENTS — name a workspace layout and come back to it. Part of the windows-vs-tabs premise; see lib/window-mode.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/rail/save-layout-dialog',
    why: 'naming one of the above; see lib/window-mode.',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/rail/plan-card',
    why: 'the flat plan’s state at the foot of the rail — trial days, capacity. sparx sells tiers, so its equivalent is an upgrade banner in components/billing. The console still never knows a price (RULE #2).',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/lifecycle-band',
    why: 'the bar that says a business is about to stop working, in the HeaderNotice slot BOTH Piggles shells mount. It has to be a band here because the Piggles rail collapses and the phone shell has no rail at all, so components/rail/plan-card warned neither population — a phone showed nothing whatsoever about a trial ending and then the site went dark (issue 369). sparx says the same thing with components/billing/billing-banner.tsx plus its topbar trial chip: same capability, different chrome, and sparx has no compact shell to lose it in.',
  },
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/billing/lifecycle',
    why: 'the WORDS for each lifecycle phase, shared by the rail card and the band so the two cannot drift — they did, and the drift was a whole population being warned by neither. Not the same thing as sparx’s lib/billing, which is prices and plan comparison: this holds a phase, a countdown and a sentence, and no money at all (RULE #2).',
  },
  {
    axis: 'components',
    only: 'piggles',
    path: 'components/table',
    why: 'a local default on silica’s Table scroll wrapper. A call-site patch that belongs upstream — raise it against silicaui rather than copying it into sparx (root RULE #1).',
  },
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/dock/tab-scroll',
    why: 'see lib/window-mode.',
  },

  // ── Vocabulary: one shared service, two product languages ───────────────
  {
    axis: 'lib',
    only: 'piggles',
    path: 'lib/onboarding/piggles-words',
    why: 'api-rest composes the first-run checklist SERVER-SIDE and hands over finished strings, so its copy is sparx’s copy — "Open CMS", "design your own in the Builder". Those are sparx’s real product names and its customers do say them, so the source must not change; the Piggles side of the wire translates them instead. There is nothing for sparx to build: it is already reading its own words.',
  },

  // ── The tour: one capability, two deliveries ────────────────────────────
];

/** Furniture that must be REACHABLE from the root layout, not merely present. */
const MOUNTED = [
  { path: 'components/feedback/provider', why: 'the feedback composer and its scheduled pulse' },
  { path: 'components/notification-center', why: 'notifications' },
  { path: 'components/deep-link-arrival', why: 'arriving on a link into a specific pane' },
  { path: 'components/crash-listeners', why: 'unhandled errors and rejections get reported' },
  { path: 'components/write-failure-reporter', why: 'a failed save is never silent' },
  { path: 'components/root-boundary', why: 'the last-resort error boundary' },
  { path: 'components/launcher', why: 'the command palette' },
  { path: 'components/recents-recorder', why: 'recently visited surfaces' },
  { path: 'components/update-notifier', why: 'a new build is available' },
  { path: 'components/posthog-provider', why: 'product analytics, behind consent' },
  { path: 'components/status-bar', why: 'the status strip' },
  { path: 'lib/tour/~first-run', why: 'the shell guide is offered to somebody new' },
  {
    path: 'lib/tour/~deep-offers',
    why: 'each tool offers its own walk the first time it is opened',
  },
];

/** Furniture that arrives as a symbol from a package rather than a local file. */
const MOUNTED_SYMBOLS = [
  { symbol: 'ToastProvider', why: 'toasts' },
  {
    symbol: 'ImperativeAlertDialogProvider',
    why: 'the imperative confirm every destructive action uses',
  },
];

// ── plumbing ────────────────────────────────────────────────────────────────

const CODE = new Set(['.ts', '.tsx']);
const SKIP = new Set(['node_modules', '.next', '.turbo', 'dist', 'coverage']);

/** Assert and read a directory. A scan root that vanished must be LOUD. */
function mustDir(abs, what) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    console.error(`✗ check:console-parity — ${what} does not exist: ${abs}`);
    console.error('  A check that scans nothing prints green. Fix the path or delete the axis.');
    process.exit(1);
  }
  return abs;
}

function walk(abs, base, out = []) {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
      continue;
    }
    const ext = path.extname(entry.name);
    // Tests are not system furniture. This axis asks whether the two consoles
    // have the same SCREENS and plumbing; a test file is neither, and the two
    // products test differently by construction — Piggles' console has a vitest
    // seat and sparx's workbench has none. Comparing them would mean an
    // EXCEPTIONS entry per test file forever, each one reading as a capability
    // sparx is missing.
    if (!CODE.has(ext) || entry.name.endsWith('.d.ts')) continue;
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    out.push(path.relative(base, full).split(path.sep).join('/').slice(0, -ext.length));
  }
  return out;
}

const isUnder = (p, prefix) => p === prefix || p.startsWith(`${prefix}/`);

/** Rename, then collapse. Returns the name both sides are compared under. */
function canonicalise(side, p) {
  const renames = [...RENAMES].sort((a, b) => b[side].length - a[side].length);
  let out = p;
  for (const r of renames) {
    if (isUnder(out, r[side])) {
      out = r.canonical + out.slice(r[side].length);
      break;
    }
  }
  for (const c of COLLAPSE) {
    if (c.side === side && isUnder(out, c.path)) return c.into ?? c.path;
  }
  return out;
}

/** Every route the app serves, as a path. */
function routes(consoleDir) {
  const appDir = mustDir(path.join(ROOT, consoleDir, 'app'), `${consoleDir}/app`);
  const found = new Set();
  const visit = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/^(route|page)\.tsx?$/.test(entry.name)) continue;
      const rel = path.relative(appDir, abs).split(path.sep).join('/');
      found.add(rel ? `app/${rel}` : 'app');
    }
  };
  visit(appDir);
  return [...found];
}

function deps(consoleDir) {
  const pkg = path.join(ROOT, consoleDir, 'package.json');
  if (!fs.existsSync(pkg)) {
    console.error(`✗ check:console-parity — no package.json at ${consoleDir}`);
    process.exit(1);
  }
  return Object.keys(JSON.parse(fs.readFileSync(pkg, 'utf8')).dependencies ?? {});
}

// ── the import graph, for the mounting half ─────────────────────────────────

const SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function resolveModule(abs) {
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    if (fs.existsSync(abs + ext)) return abs + ext;
  }
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      const idx = path.join(abs, `index${ext}`);
      if (fs.existsSync(idx)) return idx;
    }
  }
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

/** Files reachable by import from the console's entry points, plus every symbol they name. */
function reachable(consoleDir) {
  const base = path.join(ROOT, consoleDir);
  const entries = [
    'app/layout.tsx',
    'app/page.tsx',
    'app/[...path]/page.tsx',
    'app/popout/page.tsx',
  ]
    .map((p) => path.join(base, p))
    .filter((p) => fs.existsSync(p));
  if (entries.length === 0) {
    console.error(`✗ check:console-parity — ${consoleDir} has no app/layout.tsx to walk from`);
    process.exit(1);
  }

  const seen = new Set();
  const symbols = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}/g)) {
      for (const name of m[1].split(',')) symbols.add(name.trim().split(/\s+as\s+/)[0]);
    }
    for (const m of src.matchAll(SPECIFIER)) {
      const spec = m[1];
      let target = null;
      if (spec.startsWith('@/')) target = path.join(base, spec.slice(2));
      else if (spec.startsWith('.')) target = path.resolve(path.dirname(file), spec);
      if (!target) continue;
      const resolved = resolveModule(target);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  const files = new Set(
    [...seen].map((f) =>
      path
        .relative(base, f)
        .split(path.sep)
        .join('/')
        .replace(/\.(tsx?|jsx?)$/, '')
    )
  );
  return { files, symbols };
}

// ── run ─────────────────────────────────────────────────────────────────────

const sides = ['sparx', 'piggles'];
const other = { sparx: 'piggles', piggles: 'sparx' };
const failures = [];
const used = new Set();

function inventory(side, axis) {
  const dir = CONSOLES[side].dir;
  if (axis === 'routes') return routes(dir).map((p) => canonicalise(side, p));
  if (axis === 'deps') return deps(dir);
  const abs = mustDir(path.join(ROOT, dir, axis), `${dir}/${axis}`);
  return walk(abs, path.join(ROOT, dir)).map((p) => canonicalise(side, p));
}

console.log('check:console-parity — sparx workbench vs Piggles console\n');

for (const axis of ['components', 'lib', 'routes', 'deps']) {
  const have = {
    sparx: new Set(inventory('sparx', axis)),
    piggles: new Set(inventory('piggles', axis)),
  };
  const divergent = [];

  for (const side of sides) {
    for (const p of [...have[side]].sort()) {
      if (have[other[side]].has(p)) continue;
      const excused = EXCEPTIONS.find(
        (e) => e.axis === axis && e.only === side && isUnder(p, e.path)
      );
      if (excused) {
        used.add(excused);
        continue;
      }
      divergent.push({ side, path: p });
    }
  }

  const paired = [...have.sparx].filter((p) => have.piggles.has(p)).length;
  const excused = EXCEPTIONS.filter((e) => e.axis === axis).length;
  console.log(
    `  ${axis.padEnd(11)} ${String(have.sparx.size).padStart(3)} sparx / ${String(have.piggles.size).padStart(3)} piggles` +
      `  →  ${paired} paired, ${excused} excused, ${divergent.length} divergent`
  );

  for (const d of divergent) {
    failures.push(
      `${axis}: ${d.path} exists in ${CONSOLES[d.side].label} only` +
        ` — build it in ${CONSOLES[other[d.side]].label}, or add it to EXCEPTIONS with the reason.`
    );
  }
}

// Mounting — presence proves nothing.
console.log('');
for (const side of sides) {
  const { files, symbols } = reachable(CONSOLES[side].dir);
  for (const m of MOUNTED) {
    const target = canonicalise(side, m.path);
    const local = RENAMES.find((r) => r.canonical === target || isUnder(target, r.canonical));
    const asSide = local ? m.path.replace(local.canonical, local[side]) : m.path;
    const hit = [...files].some((f) => isUnder(f, asSide));
    if (!hit) {
      failures.push(
        `mounting: ${CONSOLES[side].label} — ${asSide} is not reachable from app/layout.tsx (${m.why}).` +
          ' Present-but-unmounted looks identical to absent.'
      );
    }
  }
  for (const s of MOUNTED_SYMBOLS) {
    if (!symbols.has(s.symbol)) {
      failures.push(
        `mounting: ${CONSOLES[side].label} — <${s.symbol}> is never imported in the mounted tree (${s.why}).`
      );
    }
  }
  console.log(
    `  mounting    ${CONSOLES[side].label}: ${files.size} modules reachable from the root layout`
  );
}

// The exception list has to stay honest, or it becomes the place gaps go to die.
const stale = EXCEPTIONS.filter((e) => !used.has(e));
for (const e of stale) {
  failures.push(
    `stale exception: ${e.axis} — "${e.path}" (${e.only} only) no longer diverges.` +
      ' Delete the entry; an exception nobody can see the effect of is how the next one gets waved through.'
  );
}

console.log('');
if (failures.length > 0) {
  console.error(
    `✗ check:console-parity — ${failures.length} problem${failures.length === 1 ? '' : 's'}\n`
  );
  for (const f of failures) console.error(`  • ${f}`);
  console.error(
    '\n  Remember what this cannot tell you: it compares the two consoles to each other.'
  );
  console.error('  Anything BOTH are missing passes silently.');
  process.exit(1);
}

console.log('✓ check:console-parity — the two consoles carry the same system surface');
console.log('  (this compares them to each other; anything both lack passes silently)');
