// Dashboard ESLint config — extends the root, then layers on the
// "no raw Tailwind in feature code" rule from docs/23-frontend-component-architecture.md §14.
//
// The selector flags className literals that pair a background FILL with a
// foreground TEXT COLOR — the fingerprint of reimplementing a styled control
// (Button/Input/Badge/Alert) by hand. Pure layout/positioning/spacing/sizing,
// a lone background (an indicator dot), or lone text-coloring all pass through;
// those are purposeful Tailwind, not design-system bypasses. See docs/23 §14.

import rootConfig from '../../eslint.config.js';

// Backing-service packages the dashboard is NOT allowed to import directly.
// Everything tenant-scoped must go through api.sparx.works (api-rest). The
// auth handler is a deliberate exception — Better Auth needs the User row
// on every request, and there is no transport between it and `@sparx/db`
// short of moving auth itself out of Next.
//
// Excluded on purpose:
//   - `@sparx/ui`, `@sparx/cms-editor` — pure UI/editor libraries (no DB).
//   - `@sparx/*-schemas` — Zod schemas and shared types (no DB).
//   - `@sparx/auth` (the package, not the HTTP handler) — the dashboard
//     reads its own session via `requireSession()`; the prisma write paths
//     it exposes (api-key issue/revoke) are admin-only and route through
//     the auth package's own adapter.
//   - `@sparx/<module>/manifest` sub-paths — presentation metadata only.
//     The no-restricted-imports rule matches the exact specifier, so a ban
//     on `@sparx/commerce` does NOT match `@sparx/commerce/manifest`.
const BANNED_SERVICE_PACKAGES = [
  '@sparx/db',
  '@sparx/cms',
  '@sparx/commerce',
  '@sparx/crm',
  '@sparx/sitebuilder',
  '@sparx/email',
  '@sparx/b2b',
  '@sparx/dropship',
  '@sparx/ai',
  '@sparx/onboarding',
  '@sparx/integrations',
];

export default [
  ...rootConfig,
  {
    // Hard wall: no backing-service imports anywhere under apps/dashboard.
    // Better Auth's HTTP handler is the single exception — Better Auth needs
    // to talk to its own user/session tables on every request, and there is
    // no transport between it and `@sparx/db` short of moving auth itself
    // out of Next.
    files: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    ignores: ['app/api/auth/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: BANNED_SERVICE_PACKAGES.map((name) => ({
            name,
            message:
              'apps/dashboard must call api.sparx.works (lib/api-rest-client). Direct service imports are banned — add a route to services/api-rest instead.',
          })),
        },
      ],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          // Flags a background FILL paired with a foreground TEXT COLOR — the
          // fingerprint of reimplementing a styled control (Button/Input/Badge/
          // Alert) in feature code. Layout, positioning, spacing, sizing, and a
          // single bg OR a single text-color (e.g. an indicator dot, or just
          // coloring text) all pass through — those are purposeful (docs/23 §14).
          selector:
            'JSXAttribute[name.name="className"][value.type="Literal"][value.value=/(?=.*(?:bg-\\[(?:var\\(|#|rgb|hsl|oklch)|bg-white|bg-black))(?=.*(?:text-\\[(?:var\\(|#|rgb|hsl|oklch)|text-white|text-black))/]',
          message:
            'This className pairs a background fill with a foreground text color — that reimplements a styled control (Button/Input/Badge/Alert). Use the @sparx/ui component or variant. Layout, spacing, positioning, and single-purpose utilities are fine (docs/23 §14).',
        },
      ],
    },
  },
  {
    // CMS-route Cards must always opt in to the module top stripe — every
    // <Card> under app/(dashboard)/cms/** lives inside <ModuleProvider
    // module="cms"> and is expected to carry variant="module". A missing
    // variant is the "soft" Card that the audit flagged six times (F-16,
    // F-20, F-22, F-23, F-32, F-33). Restrict the bare element so future
    // regressions show up in CI.
    files: ['app/(dashboard)/cms/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          // From-the-config bag of constraints stays: keep the raw-Tailwind
          // rule above, plus the CMS-only Card variant guard. ESLint merges
          // by overwrite, so list both selectors in this stanza.
          // Flags a background FILL paired with a foreground TEXT COLOR — the
          // fingerprint of reimplementing a styled control (Button/Input/Badge/
          // Alert) in feature code. Layout, positioning, spacing, sizing, and a
          // single bg OR a single text-color (e.g. an indicator dot, or just
          // coloring text) all pass through — those are purposeful (docs/23 §14).
          selector:
            'JSXAttribute[name.name="className"][value.type="Literal"][value.value=/(?=.*(?:bg-\\[(?:var\\(|#|rgb|hsl|oklch)|bg-white|bg-black))(?=.*(?:text-\\[(?:var\\(|#|rgb|hsl|oklch)|text-white|text-black))/]',
          message:
            'This className pairs a background fill with a foreground text color — that reimplements a styled control (Button/Input/Badge/Alert). Use the @sparx/ui component or variant. Layout, spacing, positioning, and single-purpose utilities are fine (docs/23 §14).',
        },
        {
          // Match opening <Card …> elements that do NOT carry a `variant`
          // attribute. Catches `<Card>`, `<Card padding="none">`, etc.
          // Still allows aliases (`<MyCard>`) since those wrap Card and
          // own their own variant decision.
          selector:
            "JSXOpeningElement[name.name='Card']:not(:has(JSXAttribute[name.name='variant']))",
          message:
            'CMS Cards must declare variant="module" (or variant="default" with an explicit reason comment). The /cms route group lives inside <ModuleProvider module="cms"> — Cards without variant lose the teal top stripe (audit F-16/20/22/23/32/33).',
        },
      ],
    },
  },
];
