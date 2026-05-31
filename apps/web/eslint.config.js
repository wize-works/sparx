// apps/web ESLint — extends root, enforces the "no raw Tailwind in feature code"
// rule from docs/23-frontend-component-architecture.md §15.
//
// Marketing-only chrome that has no @sparx/ui primitive should use inline styles
// referencing the CSS custom properties from tokens.css, NOT composed Tailwind.

import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          // See docs/23 §15: flags a background FILL paired with a foreground
          // TEXT COLOR (reimplementing a styled control). Layout/positioning/
          // spacing and lone color usage pass through.
          selector:
            'JSXAttribute[name.name="className"][value.type="Literal"][value.value=/(?=.*(?:bg-\\[(?:var\\(|#|rgb|hsl|oklch)|bg-white|bg-black))(?=.*(?:text-\\[(?:var\\(|#|rgb|hsl|oklch)|text-white|text-black))/]',
          message:
            'This className pairs a background fill with a foreground text color — that reimplements a styled control. Use a @sparx/ui component/variant or inline styles with CSS vars from tokens.css. Layout, spacing, and positioning utilities are fine (docs/23 §15).',
        },
      ],
    },
  },
];
