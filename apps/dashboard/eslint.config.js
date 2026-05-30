// Dashboard ESLint config — extends the root, then layers on the
// "no raw Tailwind in feature code" rule from docs/23-frontend-component-architecture.md §14.
//
// The selector matches className string literals containing two or more
// Tailwind-shaped utility prefixes (bg-, text-, border-, p-, m-, flex, grid, rounded).
// Layout overrides ("py-10", "h-4 w-4") and single-class usage pass through
// because they're the explicit escape hatch in the spec.

import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'JSXAttribute[name.name="className"][value.type="Literal"][value.value=/\\b(bg-|text-|border-|p-|m-|flex|grid|rounded).*(bg-|text-|border-|p-|m-|flex|grid|rounded)/]',
          message:
            'Use @sparx/ui components/variants instead of composing Tailwind classes in feature code (docs/23 §14).',
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
          selector:
            'JSXAttribute[name.name="className"][value.type="Literal"][value.value=/\\b(bg-|text-|border-|p-|m-|flex|grid|rounded).*(bg-|text-|border-|p-|m-|flex|grid|rounded)/]',
          message:
            'Use @sparx/ui components/variants instead of composing Tailwind classes in feature code (docs/23 §14).',
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
