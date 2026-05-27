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
];
